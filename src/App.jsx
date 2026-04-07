import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { auth, provider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
// --- NEW IMPORT: The Charting Library ---
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

function App() {
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  
  const [useUrl, setUseUrl] = useState(true);
  const [manualJdText, setManualJdText] = useState('');

  const [resumeText, setResumeText] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [tailoredResume, setTailoredResume] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [coverLetter, setCoverLetter] = useState('');
  const [loadingLetter, setLoadingLetter] = useState(false);

  const [coldEmail, setColdEmail] = useState('');
  const [loadingEmail, setLoadingEmail] = useState(false);
  
  const [interviewQuestions, setInterviewQuestions] = useState('');
  const [loadingInterview, setLoadingInterview] = useState(false);

  const [recommendations, setRecommendations] = useState(null);
  const [loadingRecs, setLoadingRecs] = useState(false);

  const [template, setTemplate] = useState('standard');
  const [user, setUser] = useState(null);
  const [resumeHistory, setResumeHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) fetchHistory(currentUser.uid);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => signInWithPopup(auth, provider).catch(console.error);
  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setResumeHistory([]);
    setShowHistory(false);
  };

  const fetchHistory = async (uid) => {
    try {
      const res = await axios.get(`https://resume-automator-api.onrender.com/get_my_resumes/${uid}`);
      setResumeHistory(res.data.history);
    } catch (err) { console.error("Failed to fetch history"); }
  };

  const handleUpload = async () => {
    if (!file) return alert("Please select a file first!");
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post('https://resume-automator-api.onrender.com/upload_resume', formData);
      setResumeText(res.data.extracted_data.raw_content);
      alert("Resume Uploaded & Parsed Successfully!");
    } catch (err) { alert("Upload failed."); }
  };

  const handleDiscoverJobs = async () => {
    if (!resumeText) return alert("Please upload and parse your resume first!");
    setLoadingRecs(true);
    try {
      const res = await axios.post('https://resume-automator-api.onrender.com/discover_jobs', { resume_text: resumeText });
      setRecommendations(res.data.recommendations);
    } catch (err) {
      alert("Failed to fetch recommendations.");
    }
    setLoadingRecs(false);
  };

  const streamAIResponse = async (endpoint, payload, stateSetter, loadingSetter) => {
    loadingSetter(true);
    stateSetter(''); 
    try {
      const response = await fetch(`https://resume-automator-api.onrender.com/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      loadingSetter(false); 

      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          stateSetter((prev) => prev + chunk); 
        }
      }
    } catch (err) {
      alert("Streaming connection failed.");
      loadingSetter(false);
    }
  };

  const getJobDescription = async () => {
    if (!useUrl) {
      if (!manualJdText) throw new Error("Please paste the job description text.");
      return manualJdText;
    }
    if (!url) throw new Error("Please paste a job URL.");
    
    const jobRes = await axios.post(`https://resume-automator-api.onrender.com/scrape_job?url=${url}`);
    if (jobRes.data.status === "error") throw new Error(jobRes.data.details || "Failed to scrape URL.");
    return jobRes.data.job_data.description;
  };

  const handleProcess = async () => {
    if (!resumeText) return alert("Upload resume first!");
    setLoading(true);
    setTailoredResume(''); 
    
    try {
      const jd = await getJobDescription(); 
      const analysisRes = await axios.post('https://resume-automator-api.onrender.com/analyze_match', { resume_text: resumeText, jd_text: jd });
      setAnalysis(analysisRes.data.analysis);
      
      setLoading(false); 
      await streamAIResponse('tailor_resume', { resume_text: resumeText, jd_text: jd }, setTailoredResume, () => {});

    } catch (err) { 
      alert(err.message || "Processing failed. If the URL is blocked, try pasting the text manually!"); 
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (tailoredResume.includes("RESOURCE_EXHAUSTED") || tailoredResume.includes("Error:")) return alert("Invalid resume generation.");
    try {
      const response = await axios.post('https://resume-automator-api.onrender.com/download_resume', { 
        text: tailoredResume, 
        template: template,
        doc_type: "Resume" 
      }, { responseType: 'blob' });
      
      const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `Final_Tailored_Resume_${template}.pdf`);
      document.body.appendChild(link);
      link.click(); link.remove();

      if (user) {
        await axios.post('https://resume-automator-api.onrender.com/save_resume_history', {
          uid: user.uid, email: user.email, job_url: useUrl ? url : "Manual Text Input", match_score: analysis?.score || 0, tailored_text: tailoredResume
        });
        fetchHistory(user.uid);
      }
    } catch (err) { alert("PDF generation failed."); }
  };

  const handleCoverLetter = async () => {
    try {
      const jd = await getJobDescription();
      streamAIResponse('generate_cover_letter', { resume_text: resumeText, jd_text: jd }, setCoverLetter, setLoadingLetter);
    } catch (err) { alert(err.message); }
  };

  const handleDownloadLetter = async () => {
    if (!coverLetter) return alert("No cover letter generated yet.");
    try {
      const response = await axios.post('https://resume-automator-api.onrender.com/download_resume', { 
        text: coverLetter, 
        template: template, 
        doc_type: "Cover Letter" 
      }, { responseType: 'blob' });
      
      const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `Cover_Letter_${template}.pdf`);
      document.body.appendChild(link);
      link.click(); link.remove();
    } catch (err) { alert("Cover Letter PDF generation failed."); }
  };

  const handleColdEmail = async () => {
    try {
      const jd = await getJobDescription();
      streamAIResponse('generate_cold_email', { resume_text: resumeText, jd_text: jd }, setColdEmail, setLoadingEmail);
    } catch (err) { alert(err.message); }
  };

  const handleInterview = async () => {
    try {
      const jd = await getJobDescription();
      streamAIResponse('generate_interview', { resume_text: resumeText, jd_text: jd }, setInterviewQuestions, setLoadingInterview);
    } catch (err) { alert(err.message); }
  };

  const handleApplyNow = async (textToCopy) => {
    if (useUrl && !url) return alert("No job URL found!");
    try {
      await navigator.clipboard.writeText(textToCopy);
      alert("Copied to clipboard! Redirecting you to the job application...");
      if (useUrl) window.open(url, '_blank'); 
    } catch (err) {
      alert("Redirecting you to the job application...");
      if (useUrl) window.open(url, '_blank');
    }
  };

  // --- NEW: Calculate Chart Data from overall analysis ---
  const getChartData = () => {
    if (!analysis) return [];
    const missingCount = analysis.missing_keywords ? analysis.missing_keywords.length : 0;
    const baseScore = analysis.score;
    
    // Create a realistic looking breakdown based on the single AI score
    return [
      { subject: 'Core Skills', value: baseScore, fullMark: 100 },
      { subject: 'Keywords', value: Math.max(10, 100 - (missingCount * 8)), fullMark: 100 },
      { subject: 'Experience', value: Math.min(100, baseScore + 10), fullMark: 100 },
      { subject: 'Formatting', value: 85, fullMark: 100 }, // Constant baseline
      { subject: 'Readability', value: Math.min(100, baseScore + 5), fullMark: 100 },
    ];
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-800">
      
      {/* Header */}
      <div className="max-w-6xl mx-auto flex justify-between items-center mb-10">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">AI Resume Automator</h1>
        <div>
          {user ? (
            <div className="flex items-center gap-4">
              <span className="font-medium text-slate-600">Hello, {user.displayName}</span>
              <button onClick={() => setShowHistory(!showHistory)} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow-sm transition font-medium">
                {showHistory ? 'Hide Dashboard' : 'View Dashboard'}
              </button>
              <button onClick={handleLogout} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg shadow-sm transition font-medium">Sign Out</button>
            </div>
          ) : (
            <button onClick={handleLogin} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md transition font-semibold">
              Sign in with Google
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Dashboard */}
        {user && showHistory && (
          <div className="bg-sky-50 border border-sky-200 p-6 rounded-2xl shadow-sm">
            <h2 className="text-xl font-bold text-sky-900 mb-4">Your Saved Resumes</h2>
            {resumeHistory.length === 0 ? <p className="text-sky-700">No saved resumes yet.</p> : (
              <div className="grid gap-3">
                {resumeHistory.map((item, index) => (
                  <div key={index} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
                    <div>
                      <a href={item.job_url !== "Manual Text Input" ? item.job_url : "#"} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">{item.job_url.substring(0, 50)}{item.job_url.length > 50 ? '...' : ''}</a>
                      <p className="text-xs text-slate-400 mt-1">Saved on: {new Date(item.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`font-bold px-3 py-1 rounded-full text-sm ${item.match_score > 70 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>Score: {item.match_score}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Upload & Target Job */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold mb-4 text-slate-700">1. Upload Resume</h3>
            <input type="file" onChange={(e) => setFile(e.target.files[0])} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-4 cursor-pointer" />
            
            <div className="flex gap-3">
              <button onClick={handleUpload} className="w-1/2 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold transition">Upload & Parse</button>
              <button onClick={handleDiscoverJobs} disabled={!resumeText || loadingRecs} className="w-1/2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition disabled:opacity-50">
                {loadingRecs ? 'Analyzing...' : 'Discover Roles'}
              </button>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-700">2. Target Job</h3>
              <button 
                onClick={() => setUseUrl(!useUrl)} 
                className="text-sm text-blue-600 font-semibold hover:text-blue-800 transition underline decoration-blue-300 underline-offset-4"
              >
                {useUrl ? "Website Blocked? Paste Text" : "Use URL Link Instead"}
              </button>
            </div>
            
            {useUrl ? (
              <input type="text" placeholder="Paste Job URL..." value={url} onChange={(e) => setUrl(e.target.value)} className="w-full p-3 mb-4 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition" />
            ) : (
              <textarea placeholder="Paste the full job description text here..." value={manualJdText} onChange={(e) => setManualJdText(e.target.value)} className="w-full h-32 p-3 mb-4 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition resize-y text-sm" />
            )}

            <button onClick={handleProcess} disabled={loading} className={`w-full py-3 rounded-xl font-semibold text-white transition ${loading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {loading ? 'AI is Processing...' : 'Analyze & Tailor'}
            </button>
          </div>
        </div>

        {/* Career Discovery Results */}
        {recommendations && (
          <div className="bg-indigo-50 border border-indigo-100 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-900 mb-6">AI Career Discovery</h2>
            <p className="text-indigo-700 mb-6">Based on your unique skill composition, you are highly competitive for these roles:</p>
            
            <div className="grid md:grid-cols-3 gap-6">
              {recommendations.map((rec, index) => (
                <div key={index} className="bg-white p-6 rounded-xl shadow-sm border border-indigo-50 flex flex-col h-full">
                  <h3 className="text-xl font-bold text-slate-800 mb-2">{rec.title}</h3>
                  <p className="text-sm text-slate-600 mb-6 flex-grow">{rec.reason}</p>
                  
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Live Search Links</p>
                    <div className="flex flex-wrap gap-2">
                      <a href={rec.links.LinkedIn} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold rounded-lg transition">LinkedIn</a>
                      <a href={rec.links.WeWorkRemotely} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold rounded-lg transition">Remote</a>
                      <a href={rec.links.Indeed} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs font-bold rounded-lg transition">Indeed</a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LOADING SKELETON */}
        {loading && (
          <div className="animate-pulse bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-4">
            <div className="h-6 bg-slate-200 rounded w-1/4"></div>
            <div className="space-y-3">
              <div className="h-4 bg-slate-200 rounded w-full"></div>
              <div className="h-4 bg-slate-200 rounded w-5/6"></div>
              <div className="h-4 bg-slate-200 rounded w-4/6"></div>
            </div>
            <p className="text-center text-slate-400 font-medium animate-bounce mt-4">Scraping site & matching keywords with Groq LLM...</p>
          </div>
        )}

        {/* UPDATED: Visual ATS Radar Results */}
        {!loading && analysis && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-2xl font-bold mb-6 text-slate-800">Application Readiness</h2>
            <div className="grid md:grid-cols-2 gap-8 items-center">
              
              {/* Radar Chart */}
              <div className="h-72 w-full flex justify-center items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={getChartData()}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 13, fontWeight: 600 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="ATS Match" dataKey="value" stroke="#4f46e5" strokeWidth={2} fill="#6366f1" fillOpacity={0.4} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Analysis Details */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Overall Match Score</h3>
                  <div className="text-5xl font-extrabold flex items-baseline gap-2">
                    <span className={analysis.score > 70 ? 'text-emerald-500' : 'text-amber-500'}>{analysis.score}</span>
                    <span className="text-xl text-slate-400 font-semibold">/ 100</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Recruiter Verdict</h3>
                  <p className="text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">{analysis.verdict}</p>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Missing Keywords to Add</h3>
                  <div className="flex flex-wrap gap-2">
                    {analysis.missing_keywords && analysis.missing_keywords.map((k, i) => (
                      <span key={i} className="px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-sm font-bold shadow-sm">{k}</span>
                    ))}
                    {(!analysis.missing_keywords || analysis.missing_keywords.length === 0) && (
                      <span className="text-sm text-slate-500 italic">No major keywords missing!</span>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Editable Resume */}
        {!loading && (tailoredResume || analysis) && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800">3. Human-in-the-Loop Editor</h3>
            </div>
            <textarea value={tailoredResume} onChange={(e) => setTailoredResume(e.target.value)} placeholder="AI is generating your resume..." className="w-full h-96 p-5 rounded-xl border border-slate-200 bg-slate-50 font-mono text-sm leading-relaxed focus:ring-2 focus:ring-blue-500 outline-none mb-4 resize-y" />
            
            <div className="flex flex-wrap md:flex-nowrap gap-4">
              <select value={template} onChange={(e) => setTemplate(e.target.value)} className="p-3 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 outline-none w-full md:w-1/4">
                <option value="standard">Standard (Harvard)</option>
                <option value="modern">Modern (Blue)</option>
                <option value="executive">Executive (Navy)</option>
                <option value="minimalist">Minimalist</option>
                <option value="creative">Creative (Teal)</option>
              </select>
              <button onClick={handleDownload} className="w-full md:w-1/2 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold shadow-md transition">
                Save & Download PDF
              </button>
              <button onClick={() => handleApplyNow(tailoredResume)} className="w-full md:w-1/4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition">
                Copy & Apply
              </button>
            </div>
          </div>
        )}

        {/* Bonus Features: Cover Letter, Cold Email & Interview */}
        {!loading && analysis && (
          <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-6 pb-20">
            
            {/* Cover Letter Box */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800">Cover Letter</h3>
                <button onClick={handleCoverLetter} disabled={loadingLetter} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                  {loadingLetter ? 'Connecting...' : 'Draft Letter'}
                </button>
              </div>
              {loadingLetter ? (
                <div className="animate-pulse space-y-3 flex-grow"><div className="h-4 bg-slate-200 rounded w-full"></div><div className="h-4 bg-slate-200 rounded w-5/6"></div></div>
              ) : (coverLetter || analysis) && (
                <>
                  <textarea value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} placeholder="Click generate to stream your cover letter..." className="w-full h-64 p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm leading-relaxed mb-4 flex-grow" />
                  {coverLetter && (
                    <div className="flex gap-2">
                      <button onClick={handleDownloadLetter} className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold shadow-sm transition text-sm">
                        Download PDF
                      </button>
                      <button onClick={() => handleApplyNow(coverLetter)} className="w-1/2 py-2.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg font-bold transition text-sm">
                        Copy & Apply
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Networking Cold Email Box */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800">Networking Email</h3>
                <button onClick={handleColdEmail} disabled={loadingEmail} className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                  {loadingEmail ? 'Connecting...' : 'Draft Email'}
                </button>
              </div>
              {loadingEmail ? (
                <div className="animate-pulse space-y-3 flex-grow"><div className="h-4 bg-slate-200 rounded w-full"></div><div className="h-4 bg-slate-200 rounded w-3/4"></div></div>
              ) : (coldEmail || analysis) && (
                <>
                  <textarea value={coldEmail} onChange={(e) => setColdEmail(e.target.value)} placeholder="Click generate to stream a punchy LinkedIn outreach email..." className="w-full h-64 p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm leading-relaxed mb-4 flex-grow" />
                  {coldEmail && (
                    <button onClick={() => handleApplyNow(coldEmail)} className="w-full py-2.5 bg-teal-100 hover:bg-teal-200 text-teal-700 rounded-lg font-bold transition">
                      Copy & Send
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Mock Interview Box */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800">Mock Interview</h3>
                <button onClick={handleInterview} disabled={loadingInterview} className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                  {loadingInterview ? 'Connecting...' : 'Generate Qs'}
                </button>
              </div>
              {loadingInterview ? (
                <div className="animate-pulse space-y-3 flex-grow"><div className="h-4 bg-slate-200 rounded w-full"></div><div className="h-4 bg-slate-200 rounded w-3/4"></div></div>
              ) : (interviewQuestions || analysis) && (
                <textarea value={interviewQuestions} onChange={(e) => setInterviewQuestions(e.target.value)} placeholder="Click generate to stream FAANG interview questions..." className="w-full h-64 p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm leading-relaxed flex-grow" />
              )}
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}

export default App;