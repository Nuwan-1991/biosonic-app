import { useState, useEffect } from 'react';
import axios from 'axios';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { jsPDF } from 'jspdf';

const API_BASE_URL = "https://nuwan1991-biosonic-api.hf.space/api/v1";

function App() {
  const [token, setToken] = useState(() => { try { return localStorage.getItem("biosonic_token") || null; } catch (e) { return null; } });
  const [isPro, setIsPro] = useState(() => { try { return localStorage.getItem("biosonic_is_pro") === 'true'; } catch (e) { return false; } });
  const [isAdmin, setIsAdmin] = useState(() => { try { return localStorage.getItem("biosonic_is_admin") === 'true'; } catch (e) { return false; } });

  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [regData, setRegData] = useState({
    fullName: '', nic: '', regNo: '', mobile: '', country: '', address: '',
    clinicName: '', clinicAddress: '', clinicRegNo: '', clinicEmail: '', clinicContact: ''
  });

  const [patientData, setPatientData] = useState({ name: '', age: '', bp: '', uniqueId: '' });
  const [vitals, setVitals] = useState({ baseHz: 0, stress: 0, jitter: '--', shimmer: '--', chakra: 'Not Scanned' });
  const [neuroFace, setNeuroFace] = useState({ emotion: 'Not Scanned', brainRegion: 'Not Scanned' });
  const [graphsData, setGraphsData] = useState({ waveform: [], mfcc: [], spectrogram: [] });
  const [aiTargetHz, setAiTargetHz] = useState('--'); 
  const [therapyAudioUrl, setTherapyAudioUrl] = useState(null);
  const [dbHistory, setDbHistory] = useState([]); 
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedPatient, setExpandedPatient] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  // Admin Dashboard State
  const [adminStats, setAdminStats] = useState({ total_doctors: 0, pro_doctors: 0, total_earnings: 0, total_patients_scanned: 0 });
  const [adminDoctors, setAdminDoctors] = useState([]);
  const [doctorPatientsModal, setDoctorPatientsModal] = useState(false);
  const [selectedDoctorPatients, setSelectedDoctorPatients] = useState([]);
  const [viewingDoctorName, setViewingDoctorName] = useState('');

  // Admin Edit Doctor State
  const [adminEditModal, setAdminEditModal] = useState(false);
  const [adminEditData, setAdminEditData] = useState({ email: '', full_name: '', nic_number: '', mobile_number: '', address: '', clinic_name: '' });

  // Doctor Profile Edit State 🔴(ALUTH: password ෆීල්ඩ් එකතු කළා)
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [doctorProfile, setDoctorProfile] = useState({ full_name: '', nic_number: '', mobile_number: '', address: '', clinic_name: '', email: '', password: '' });

  useEffect(() => {
    if (token) {
      if (isAdmin) {
        fetchAdminData();
      } else {
        fetchPatientHistory();
        fetchDoctorProfile();
      }
    }
  }, [token, isAdmin]);

  // --- Admin APIs ---
  const fetchAdminData = async () => {
    try {
      const statsRes = await axios.get(`${API_BASE_URL}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } });
      setAdminStats(statsRes.data);
      const docsRes = await axios.get(`${API_BASE_URL}/admin/doctors`, { headers: { Authorization: `Bearer ${token}` } });
      setAdminDoctors(docsRes.data);
    } catch (err) { console.error("Admin data fetch failed", err); }
  };

  const viewDoctorPatients = async (docEmail, name) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/admin/doctor-patients/${docEmail}`, { headers: { Authorization: `Bearer ${token}` } });
      setSelectedDoctorPatients(res.data); setViewingDoctorName(name); setDoctorPatientsModal(true);
    } catch (err) { alert("Failed to fetch patients."); }
  };

  const handleAdminDelete = async (docEmail) => {
    if(window.confirm(`⚠️ WARNING: Are you sure you want to completely DELETE doctor (${docEmail}) and ALL their patient records? This action cannot be undone!`)) {
      try {
        await axios.delete(`${API_BASE_URL}/admin/doctor/${docEmail}`, { headers: { Authorization: `Bearer ${token}` } });
        alert("Doctor and their patients deleted successfully!"); 
        fetchAdminData();
      } catch (err) { alert(err.response?.data?.detail || "Delete failed!"); }
    }
  };

  const handleAdminBackup = async (docEmail) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/admin/doctor/${docEmail}/backup`, { headers: { Authorization: `Bearer ${token}` } });
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `Backup_${docEmail}.json`);
      document.body.appendChild(downloadAnchorNode); 
      downloadAnchorNode.click(); 
      downloadAnchorNode.remove();
      alert("Backup Downloaded Successfully!");
    } catch (err) { alert("Backup failed!"); }
  };

  const handleAdminRestore = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        if (!jsonData.doctor_info) return alert("Invalid Backup File format!");
        
        setLoading(true);
        await axios.post(`${API_BASE_URL}/admin/doctor/restore`, jsonData, { headers: { Authorization: `Bearer ${token}` } });
        alert(`Backup Restored Successfully for ${jsonData.doctor_info.email}!`);
        fetchAdminData();
      } catch (err) {
        alert("Backup Restore Failed! Make sure it's a valid JSON file.");
      }
      setLoading(false);
      event.target.value = null;
    };
    reader.readAsText(file);
  };

  const handleAdminEditSave = async (e) => {
    e.preventDefault(); 
    setLoading(true);
    try {
      await axios.put(`${API_BASE_URL}/admin/doctor/${adminEditData.email}`, adminEditData, { headers: { Authorization: `Bearer ${token}` } });
      alert("Doctor Profile Modified Successfully!"); 
      setAdminEditModal(false); 
      fetchAdminData();
    } catch (err) { alert("Edit failed!"); }
    setLoading(false);
  };

  const openAdminEditModal = (doc) => {
    setAdminEditData({ email: doc.email, full_name: doc.full_name || '', nic_number: doc.nic_number || '', mobile_number: doc.mobile_number || '', address: doc.address || '', clinic_name: doc.clinic_name || '' });
    setAdminEditModal(true);
  };

  // --- Profile Edit APIs ---
  const fetchDoctorProfile = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/doctor/profile`, { headers: { Authorization: `Bearer ${token}` } });
      setDoctorProfile({...res.data, password: ''}); // Password එක හිස්ව තියාගන්නවා
    } catch (err) { console.error("Profile fetch failed"); }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/doctor/profile/update`, doctorProfile, { headers: { Authorization: `Bearer ${token}` } });
      alert("Profile Successfully Updated!");
      if(doctorProfile.password) {
        alert("Your password has been changed. Please login again.");
        setToken(null); try{localStorage.clear();}catch(e){} // පාස්වර්ඩ් එක වෙනස් කළා නම් ආයෙත් ලොග් වෙන්න දෙනවා
      } else {
        setIsProfileOpen(false);
      }
    } catch (err) { alert("Profile Update Failed!"); }
    setLoading(false);
  };

  // --- Doctor APIs ---
  const fetchPatientHistory = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/patient/history`, { headers: { Authorization: `Bearer ${token}` } });
      setDbHistory(res.data);
    } catch (err) { console.error("Database fetch failure", err.message); }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLoginMode) {
        const params = new URLSearchParams();
        params.append('username', email); params.append('password', password);
        const res = await axios.post(`${API_BASE_URL}/login`, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        setToken(res.data.access_token); setIsPro(res.data.is_pro); setIsAdmin(res.data.is_admin);
        try { 
          localStorage.setItem("biosonic_token", res.data.access_token); 
          localStorage.setItem("biosonic_is_pro", res.data.is_pro);
          localStorage.setItem("biosonic_is_admin", res.data.is_admin);
        } catch (e) {}
      } else {
        await axios.post(`${API_BASE_URL}/register`, {
          email, password, full_name: regData.fullName, nic_number: regData.nic, registration_no: regData.regNo,
          mobile_number: regData.mobile, country: regData.country, address: regData.address, clinic_name: regData.clinicName,
          clinic_address: regData.clinicAddress, clinic_reg_no: regData.clinicRegNo, clinic_email: regData.clinicEmail, clinic_contact: regData.clinicContact
        });
        alert("Account Created Successfully! You can now log in."); setIsLoginMode(true); 
      }
    } catch (err) {
      if (err.response && err.response.status === 400) alert(isLoginMode ? "Incorrect Email or Password!" : "Email is already registered!");
      else alert("Server Error! Check backend connection.");
    }
    setLoading(false);
  };

  const startLiveVoiceScan = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        const formData = new FormData(); formData.append("audio_file", audioBlob, "live_record.wav");
        setScanStatus("Processing Triple Spectrum Waveforms...");
        try {
          const res = await axios.post(`${API_BASE_URL}/analyze-voice`, formData);
          const d = res.data.data;
          setVitals({ baseHz: d.base_hz, stress: d.vmt_stress, jitter: d.biomarkers.jitter, shimmer: d.biomarkers.shimmer, chakra: d.blocked_chakra });
          setGraphsData(d.graphs);
        } catch (err) { alert("Voice server response failed."); }
        setLoading(false); setScanStatus(''); stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start(); setLoading(true); setScanStatus('🎤 Scanning Vocal Frequencies...');
      setTimeout(() => { if(mediaRecorder.state === "recording") mediaRecorder.stop(); }, 3000); 
    } catch (err) { alert("Microphone hardware error!"); }
  };

  const startLiveFaceScan = async () => {
    try {
      setLoading(true); setScanStatus('📷 Capturing Neurological Frame...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video'); video.srcObject = stream; await video.play();
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob(async (blob) => {
        const formData = new FormData(); formData.append("image_file", blob, "live_face.jpg");
        try {
          const res = await axios.post(`${API_BASE_URL}/analyze-face`, formData);
          setNeuroFace({ emotion: res.data.data.emotion, brainRegion: res.data.data.active_brain_region });
        } catch (err) { alert("Face server breakdown."); }
        setLoading(false); setScanStatus(''); stream.getTracks().forEach(t => t.stop());
      }, 'image/jpeg');
    } catch (err) { setLoading(false); setScanStatus(''); alert("Camera hardware error!"); }
  };

  const runAiPrediction = async () => {
    if (vitals.baseHz === 0 || !patientData.age) return alert("Please type Patient Age and Scan Voice first!");
    try {
        const formData = new FormData(); formData.append("age", String(patientData.age)); formData.append("bp", String(patientData.bp || 120)); formData.append("base_hz", String(vitals.baseHz));
        const res = await axios.post(`${API_BASE_URL}/ai-predict`, formData);
        setAiTargetHz(res.data.predicted_target_hz);
    } catch (err) { alert("Prediction failed."); }
  };

  const saveToDatabase = async () => {
    if (vitals.baseHz === 0 || !patientData.name || !patientData.uniqueId) return alert("Please fill Registration Name & ID code!");
    try {
        const combinedIdentity = `${patientData.name.trim().toUpperCase()} [ID: ${patientData.uniqueId.trim()}]`;
        await axios.post(`${API_BASE_URL}/patient/save`, {
            name: combinedIdentity, age: parseInt(patientData.age) || 30, bp_systolic: parseInt(patientData.bp) || 120,
            user_hz: parseFloat(vitals.baseHz), vmt_stress: parseInt(vitals.stress), blocked_chakra: vitals.chakra,
            emotion: neuroFace.emotion, brain_region: neuroFace.brainRegion, jitter: String(vitals.jitter), shimmer: String(vitals.shimmer),
            geo_location: "Colombo, Western Province", circadian_phase: "Live Connected App", prescribed_solfeggio: "528 Hz", predicted_target: String(aiTargetHz)
        }, { headers: { Authorization: `Bearer ${token}` } });
        alert("Patient archived beautifully!"); fetchPatientHistory();
    } catch (err) { alert("Database archiving rejected."); }
  };

  const executePdfPrint = (pName, pAge, pBp, pHz, pStress, pChakra, pEmotion, pBrain, pJitter, pShimmer, pGeo, pCirc, pDate, pTarget) => {
    try {
      const doc = new jsPDF();
      const safeName = pName || 'Unknown_Patient'; 

      doc.setFont("Helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(49, 130, 206);
      doc.text("BIO-SONIC CLINICAL MATRIX REPORT", 14, 22);
      doc.setFontSize(10); doc.setTextColor(113, 128, 150); doc.setFont("Helvetica", "normal");
      doc.text(`Archived Timestamp: ${pDate || new Date().toLocaleString()}`, 14, 28);
      
      doc.setStrokeColor(26, 32, 44); doc.setLineWidth(1.2); let xStart = 150;
      for (let i = 0; i < 35; i += Math.random() > 0.4 ? 2 : 4) { doc.line(xStart + i, 14, xStart + i, 26); }
      doc.line(14, 34, 196, 34);

      let y = 44;
      const makeGrid = (lbl, val, isHead=false) => {
          if(isHead) { y += 4; doc.setFont("Helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(44, 122, 123); doc.text(lbl, 14, y); y += 4; return; }
          doc.setFillColor(247, 250, 252); doc.rect(14, y, 90, 7, "F"); doc.rect(14, y, 182, 7); doc.line(104, y, 104, y+7);
          doc.setFont("Helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(45, 55, 72); doc.text(lbl, 18, y+5);
          doc.setFont("Helvetica", "normal"); doc.text(String(val || '--'), 108, y+5); y += 7;
      };

      makeGrid("1. ENHANCED DEMOGRAPHICS PROFILE", "", true);
      makeGrid("Patient Registered Identity", safeName.toUpperCase());
      makeGrid("Patient Biological Age", `${pAge || '--'} Years`);
      makeGrid("Systolic Blood Pressure Matrix", `${pBp || '--'} mmHg`);

      makeGrid("2. INTEGRATED QUANTUM ACOUSTIC BIOMARKERS", "", true);
      makeGrid("Fundamental Vocal Tone Frequency", `${pHz || '--'} Hz`);
      makeGrid("Vocal Micro-Tremor (VMT) Stress Ratio", `${pStress || '--'}%`);
      makeGrid("Vocal Jitter Biomarker Metric", pJitter);
      makeGrid("Vocal Shimmer Biomarker Metric", pShimmer);
      makeGrid("Energy Field Chakra Resonance Alignment", pChakra);
      makeGrid("AI Calibrated Sonic Target Recommendation", `${pTarget || '--'} Hz`);

      makeGrid("3. CENTRAL NEUROLOGICAL ENVIRONMENT", "", true);
      makeGrid("Facial Micro-Expression Core Emotion", pEmotion);
      makeGrid("Hyperactive Brain Cortex Coordinates", pBrain);
      makeGrid("Geographical Coordinates Matrix", pGeo);
      makeGrid("Planetary Circadian Phase Rhythm", pCirc);

      doc.line(14, 265, 196, 265); doc.setFontSize(8); doc.text("Authorized Medical Clinical Signature", 14, 271);
      
      const fileName = `Clinical_Matrix_${safeName.split(" ")[0]}.pdf`;
      doc.save(fileName);
      alert("PDF File Successfully Downloaded to Local Storage!");
    } catch (e) {
      alert("PDF Print Failed! Please check if all data is correct.");
      console.error(e);
    }
  };

  const generateTherapy = async () => {
    if (vitals.baseHz === 0) return alert("Scan voice first!");
    setLoading(true); setScanStatus('🎹 Synthesizing AI 8D Track...');
    try {
      const formData = new FormData(); formData.append("base_hz", String(vitals.baseHz)); formData.append("stress_level", String(vitals.stress));
      const res = await axios.post(`${API_BASE_URL}/generate-therapy`, formData, { responseType: 'blob', headers: { Authorization: `Bearer ${token}` } });
      setTherapyAudioUrl(URL.createObjectURL(res.data)); alert("AI 8D Track Synthesized Successfully!");
    } catch (err) { alert("Therapy processing failure."); }
    setLoading(false); setScanStatus('');
  };

  const openReportModal = (row) => {
    setSelectedReport(row);
    setReportModalOpen(true);
  };

  const groupedPatients = {};
  dbHistory.forEach(r => { const k = r.name.toUpperCase(); if (!groupedPatients[k]) groupedPatients[k] = []; groupedPatients[k].push(r); });

  const styles = {
    appWrapper: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#F0F4F8', fontFamily: 'Arial, sans-serif', overflow: 'hidden' },
    topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#2B6CB0', color: 'white', padding: '0 25px', height: '65px', boxShadow: '0 2px 4px rgba(0,0,0,0.15)', zIndex: 10 },
    navLinks: { display: 'flex', alignItems: 'center', gap: '25px' },
    navItem: { color: '#E2E8F0', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', transition: '0.2s' },
    contentWrapper: { display: 'flex', flex: 1, overflow: 'hidden' },
    authContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#E2E8F0', overflowY: 'auto', padding: '20px' },
    authCard: { width: '100%', maxWidth: isLoginMode ? '400px' : '700px', padding: '30px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' },
    sidebar: { width: '390px', backgroundColor: '#FFFFFF', padding: '25px', borderRight: '1px solid #E2E8F0', overflowY: 'auto' },
    main: { flex: 1, padding: '40px', overflowY: 'auto' },
    input: { width: '100%', padding: '12px', margin: '10px 0', border: '1px solid #CBD5E0', borderRadius: '4px', boxSizing: 'border-box' },
    btn: { width: '100%', padding: '12px', margin: '8px 0', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', display: 'block', textAlign: 'center' },
    card: { backgroundColor: '#FFFFFF', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '20px' },
    th: { backgroundColor: '#E2E8F0', padding: '10px', textAlign: 'left', fontSize: '13px', fontWeight: 'bold', color: '#4A5568' },
    td: { padding: '10px', borderBottom: '1px solid #E2E8F0', fontSize: '13px', color: '#2D3748' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '90%', maxWidth: '900px', maxHeight: '90%', overflowY: 'auto' }
  };

  // --- 1. RENDER AUTH (LOGIN & REGISTER) ---
  if (!token) {
    return (
      <div style={styles.authContainer}>
        <div style={styles.authCard}>
          <h2 style={{ color: '#3182CE', marginTop: 0, textAlign: 'center' }}>Bio-Sonic SaaS Portal</h2>
          <form onSubmit={handleAuthSubmit}>
            {isLoginMode ? (
              <>
                <input style={styles.input} type="email" placeholder="Practitioner Email" value={email} onChange={e => setEmail(e.target.value)} required />
                <input style={styles.input} type="password" placeholder="Secure Password" value={password} onChange={e => setPassword(e.target.value)} required />
              </>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', textAlign: 'left' }}>
                <div>
                  <h4 style={{ margin: '5px 0', color: '#4A5568' }}>Personal Details</h4>
                  <input style={styles.input} placeholder="Full Name" onChange={e => setRegData({...regData, fullName: e.target.value})} required/>
                  <input style={styles.input} placeholder="NIC Number" onChange={e => setRegData({...regData, nic: e.target.value})} required/>
                  <input style={styles.input} placeholder="Medical Reg No" onChange={e => setRegData({...regData, regNo: e.target.value})} required/>
                  <input style={styles.input} placeholder="Mobile Number" onChange={e => setRegData({...regData, mobile: e.target.value})} required/>
                  <input style={styles.input} placeholder="Country" onChange={e => setRegData({...regData, country: e.target.value})} required/>
                  <input style={styles.input} placeholder="Personal Address" onChange={e => setRegData({...regData, address: e.target.value})} required/>
                </div>
                <div>
                  <h4 style={{ margin: '5px 0', color: '#4A5568' }}>Clinic & Login Details</h4>
                  <input style={styles.input} placeholder="Clinic Name" onChange={e => setRegData({...regData, clinicName: e.target.value})} required/>
                  <input style={styles.input} placeholder="Clinic Address" onChange={e => setRegData({...regData, clinicAddress: e.target.value})} required/>
                  <input style={styles.input} placeholder="Clinic Reg No" onChange={e => setRegData({...regData, clinicRegNo: e.target.value})} required/>
                  <input style={styles.input} placeholder="Clinic Phone" onChange={e => setRegData({...regData, clinicContact: e.target.value})} required/>
                  <input style={styles.input} type="email" placeholder="Login Email" value={email} onChange={e => setEmail(e.target.value)} required/>
                  <input style={styles.input} type="password" placeholder="Login Password" value={password} onChange={e => setPassword(e.target.value)} required/>
                </div>
              </div>
            )}
            <button type="submit" style={{ ...styles.btn, backgroundColor: '#3182CE', color: 'white' }} disabled={loading}>
              {isLoginMode ? "Login to Portal" : "Register as Doctor"}
            </button>
          </form>
          <p style={{ cursor: 'pointer', fontSize: '13px', color: '#4A5568', marginTop: '15px', textAlign: 'center' }} onClick={() => setIsLoginMode(!isLoginMode)}>
            {isLoginMode ? "Don't have an account? Sign Up / Register" : "Already have an account? Log In"}
          </p>
        </div>
      </div>
    );
  }

  // --- 2. RENDER SUPER ADMIN DASHBOARD ---
  if (isAdmin) {
    return (
      <div style={styles.appWrapper}>
        <div style={styles.topBar}>
          <h2 style={{margin: 0}}>👑 Bio-Sonic Super Admin Portal</h2>
          <button onClick={() => { setToken(null); setIsAdmin(false); try{localStorage.clear();}catch(e){} }} style={{backgroundColor: '#FC8181', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>Logout</button>
        </div>
        <div style={{ padding: '30px', overflowY: 'auto' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
            <div style={{...styles.card, borderLeft: '5px solid #3182CE'}}><h3 style={{margin:0, color:'#718096'}}>Total Doctors</h3><h1 style={{margin:'10px 0', color:'#2D3748'}}>{adminStats.total_doctors}</h1></div>
            <div style={{...styles.card, borderLeft: '5px solid #48BB78'}}><h3 style={{margin:0, color:'#718096'}}>Pro Subscribers</h3><h1 style={{margin:'10px 0', color:'#2D3748'}}>{adminStats.pro_doctors}</h1></div>
            <div style={{...styles.card, borderLeft: '5px solid #D69E2E'}}><h3 style={{margin:0, color:'#718096'}}>Total Earnings</h3><h1 style={{margin:'10px 0', color:'#2D3748'}}>${adminStats.total_earnings}</h1></div>
            <div style={{...styles.card, borderLeft: '5px solid #805AD5'}}><h3 style={{margin:0, color:'#718096'}}>Patients Scanned</h3><h1 style={{margin:'10px 0', color:'#2D3748'}}>{adminStats.total_patients_scanned}</h1></div>
          </div>

          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ color: '#2B6CB0', margin: 0 }}>Registered Doctors Database</h3>
              <div>
                <input type="file" id="backupUpload" style={{ display: 'none' }} accept=".json" onChange={handleAdminRestore} />
                <button onClick={() => document.getElementById('backupUpload').click()} style={{ backgroundColor: '#4FD1C5', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  📤 Upload & Restore Backup
                </button>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead><tr><th style={styles.th}>Doctor Name</th><th style={styles.th}>Email & Clinic</th><th style={styles.th}>Plan Status</th><th style={styles.th}>Joined Date</th><th style={styles.th}>Patients</th><th style={styles.th}>Actions</th></tr></thead>
              <tbody>
                {adminDoctors.map(doc => (
                  <tr key={doc.email}>
                    <td style={styles.td}><strong>{doc.full_name || 'N/A'}</strong></td>
                    <td style={styles.td}>{doc.email}<br/><span style={{color:'#718096', fontSize:'11px'}}>{doc.clinic_name}</span></td>
                    <td style={styles.td}>{doc.is_pro ? <span style={{color:'green', fontWeight:'bold'}}>PRO</span> : <span style={{color:'gray'}}>FREE</span>}</td>
                    <td style={styles.td}>{doc.registered_date ? doc.registered_date.split(' ')[0] : 'N/A'}</td>
                    <td style={styles.td}>{doc.patient_count}</td>
                    <td style={styles.td}>
                      <div style={{display: 'flex', gap: '5px'}}>
                        <button onClick={() => viewDoctorPatients(doc.email, doc.full_name)} style={{backgroundColor: '#3182CE', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize:'11px'}}>👁️ View</button>
                        <button onClick={() => openAdminEditModal(doc)} style={{backgroundColor: '#D69E2E', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize:'11px'}}>✏️ Edit</button>
                        <button onClick={() => handleAdminBackup(doc.email)} style={{backgroundColor: '#48BB78', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize:'11px'}}>💾 Backup</button>
                        <button onClick={() => handleAdminDelete(doc.email)} style={{backgroundColor: '#E53E3E', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize:'11px'}}>🗑️ Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>

        {/* Modal: Admin Edit Doctor */}
        {adminEditModal && (
          <div style={{...styles.modalOverlay, zIndex: 3000}}>
            <div style={{...styles.modalContent, maxWidth: '500px'}}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: '#D69E2E' }}>✏️ Modify Doctor Data</h2>
                <button onClick={() => setAdminEditModal(false)} style={{ backgroundColor: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer' }}>❌</button>
              </div>
              <form onSubmit={handleAdminEditSave}>
                <p style={{fontSize: '12px'}}>Target Email: <strong>{adminEditData.email}</strong></p>
                <input style={styles.input} placeholder="Full Name" value={adminEditData.full_name} onChange={e => setAdminEditData({...adminEditData, full_name: e.target.value})} required/>
                <input style={styles.input} placeholder="NIC" value={adminEditData.nic_number} onChange={e => setAdminEditData({...adminEditData, nic_number: e.target.value})} />
                <input style={styles.input} placeholder="Mobile" value={adminEditData.mobile_number} onChange={e => setAdminEditData({...adminEditData, mobile_number: e.target.value})} />
                <input style={styles.input} placeholder="Address" value={adminEditData.address} onChange={e => setAdminEditData({...adminEditData, address: e.target.value})} />
                <input style={styles.input} placeholder="Clinic Name" value={adminEditData.clinic_name} onChange={e => setAdminEditData({...adminEditData, clinic_name: e.target.value})} />
                <button type="submit" style={{ ...styles.btn, backgroundColor: '#D69E2E', color: 'white', marginTop: '15px' }} disabled={loading}>💾 Force Save Changes</button>
              </form>
            </div>
          </div>
        )}

        {/* Modal: View Specific Doctor's Patients */}
        {doctorPatientsModal && (
          <div style={{...styles.modalOverlay, zIndex: 1000}}>
            <div style={styles.modalContent}>
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '20px'}}>
                <h3 style={{margin:0, color: '#3182CE'}}>Patients Scanned by Dr. {viewingDoctorName}</h3>
                <button onClick={() => setDoctorPatientsModal(false)} style={{backgroundColor: '#FC8181', color: 'white', border: 'none', padding: '5px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>❌ Close</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead><tr><th style={styles.th}>Date</th><th style={styles.th}>Patient Name</th><th style={styles.th}>Base Hz</th><th style={styles.th}>Stress</th><th style={styles.th}>Emotion</th></tr></thead>
                <tbody>
                  {selectedDoctorPatients.map(p => (
                    <tr key={p.id}>
                      <td style={styles.td}>{p.date.split(' ')[0]}</td><td style={styles.td}>{p.name}</td>
                      <td style={styles.td}>{p.user_hz} Hz</td><td style={styles.td}>{p.vmt_stress}%</td><td style={styles.td}>{p.emotion}</td>
                    </tr>
                  ))}
                  {selectedDoctorPatients.length === 0 && <tr><td colSpan="5" style={{...styles.td, textAlign: 'center'}}>No patients scanned yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- 3. RENDER DOCTOR DASHBOARD ---
  return (
    <div style={styles.appWrapper}>
      <div style={styles.topBar}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '20px', letterSpacing: '0.5px' }}>
                🌐 Bio-Sonic Enterprise Suite 
                {isPro && <span style={{backgroundColor: '#F6E05E', color: '#744210', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', marginLeft: '10px', verticalAlign: 'middle'}}>PRO</span>}
            </h2>
        </div>
        <div style={styles.navLinks}>
            <span style={{...styles.navItem, color: 'white', borderBottom: '2px solid white', paddingBottom: '4px'}}>📊 Dashboard Core</span>
            <span style={styles.navItem} onClick={() => setIsModalOpen(true)}>🗂️ Patient Archive</span>
            
            <span style={styles.navItem} onClick={() => setIsProfileOpen(true)}>👤 My Profile</span>
            
            <button onClick={() => { setToken(null); try{localStorage.clear();}catch(e){} }} style={{ backgroundColor: '#FC8181', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', marginLeft: '15px' }}>
                Logout Session
            </button>
        </div>
      </div>

      <div style={styles.contentWrapper}>
        <div style={styles.sidebar}>
          <div style={{ padding: '15px', backgroundColor: '#F7FAFC', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
              <h3 style={{ color: '#4A5568', fontSize: '13px', marginTop: 0, marginBottom: '15px' }}>🟢 NORMAL TIER (FREE)</h3>
              <p style={{ color: '#A0AEC0', fontWeight: 'bold', fontSize: '11px', margin: '5px 0' }}>1. PATIENT REGISTRATION</p>
              <input style={styles.input} placeholder="Patient Full Name" value={patientData.name} onChange={e => setPatientData({...patientData, name: e.target.value})} />
              <input style={styles.input} placeholder="Patient Unique ID / Phone" value={patientData.uniqueId} onChange={e => setPatientData({...patientData, uniqueId: e.target.value})} />
              <input style={styles.input} placeholder="Age Profile" type="number" value={patientData.age} onChange={e => setPatientData({...patientData, age: e.target.value})} />
              <input style={styles.input} placeholder="Systolic Blood Pressure" type="number" value={patientData.bp} onChange={e => setPatientData({...patientData, bp: e.target.value})} />
              <p style={{ color: '#A0AEC0', fontWeight: 'bold', fontSize: '11px', marginTop: '15px', marginBottom: '5px' }}>2. DIAGNOSTIC SCANS</p>
              <button style={{ ...styles.btn, backgroundColor: '#90CDF4', color: '#2A4365' }} onClick={startLiveVoiceScan} disabled={loading}>🎤 3-Sec Live Voice Scan</button>
              <button style={{ ...styles.btn, backgroundColor: '#FBD38D', color: '#744210' }} onClick={startLiveFaceScan} disabled={loading}>📷 Live Neuro Face Scan</button>
              {scanStatus && <div style={{ color: '#DD6B20', fontWeight: 'bold', fontSize: '12px', textAlign: 'center', marginTop: '5px' }}>{scanStatus}</div>}
          </div>

          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: isPro ? '#FFFFF0' : '#FFF5F5', border: `1px solid ${isPro ? '#ECC94B' : '#FEB2B2'}`, borderRadius: '8px' }}>
              <h3 style={{ color: isPro ? '#D69E2E' : '#E53E3E', fontSize: '13px', marginTop: 0, marginBottom: '15px' }}>👑 PRO TIER (ADVANCED) {isPro ? '🔓' : '🔒'}</h3>
              {isPro ? (
                  <>
                      <button style={{ ...styles.btn, backgroundColor: '#ED8936', color: 'white' }} onClick={runAiPrediction}>🧠 AI Predict Target Hz</button>
                      <button style={{ ...styles.btn, backgroundColor: '#48BB78', color: 'white' }} onClick={saveToDatabase}>💾 Save Record to DB</button>
                      <button style={{ ...styles.btn, backgroundColor: '#E53E3E', color: 'white' }} onClick={() => executePdfPrint(patientData.name, patientData.age, patientData.bp || 120, vitals.baseHz, vitals.stress, vitals.chakra, neuroFace.emotion, neuroFace.brainRegion, vitals.jitter, vitals.shimmer, "Colombo, LK", "Active Rhythm", new Date().toLocaleString(), aiTargetHz)}>📄 Print Dashboard Matrix</button>
                      <button style={{ ...styles.btn, backgroundColor: '#4FD1C5', color: 'white', marginTop: '15px' }} onClick={generateTherapy}>🎹 Generate AI 8D Music</button>
                  </>
              ) : (
                  <>
                      <div style={{ opacity: 0.5, pointerEvents: 'none' }}>
                          <button style={{ ...styles.btn, backgroundColor: '#A0AEC0', color: 'white' }}>🔒 AI Predict Target Hz</button>
                          <button style={{ ...styles.btn, backgroundColor: '#A0AEC0', color: 'white' }}>🔒 Save Record to DB</button>
                          <button style={{ ...styles.btn, backgroundColor: '#A0AEC0', color: 'white' }}>🔒 Print Dashboard Matrix</button>
                          <button style={{ ...styles.btn, backgroundColor: '#A0AEC0', color: 'white', marginTop: '15px' }}>🔒 Generate AI 8D Music</button>
                      </div>
                      <div style={{ textAlign: 'center', marginTop: '15px' }}>
                          <p style={{ color: '#E53E3E', fontSize: '12px', marginBottom: '10px', fontWeight: 'bold' }}>Upgrade to PRO to Unlock All Features ($9.99)</p>
                          <PayPalScriptProvider options={{ "client-id": "test", currency: "USD" }}>
                              <PayPalButtons style={{ layout: "horizontal", height: 40 }} createOrder={(data, actions) => actions.order.create({ purchase_units: [{ amount: { value: "9.99" } }] })} onApprove={(data, actions) => actions.order.capture().then(async () => { await axios.post(`${API_BASE_URL}/upgrade-pro`, {}, { headers: { Authorization: `Bearer ${token}` } }); setIsPro(true); try { localStorage.setItem("biosonic_is_pro", "true"); } catch(e){} })} />
                          </PayPalScriptProvider>
                      </div>
                  </>
              )}
          </div>
        </div>

        <div style={styles.main}>
          <div style={styles.card}>
            <h2 style={{ color: '#3182CE', marginTop: 0 }}>Clinical Dashboard Matrix</h2>
            <p><strong>Active Identity:</strong> {patientData.name || 'Not Registered'} | Age: {patientData.age || '--'} Yrs | BP: {patientData.bp || '--'} mmHg</p>
            <hr style={{ border: '0', borderTop: '1px solid #E2E8F0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <h3>Vocal Biomarkers</h3>
                <p>Fundamental Frequency: <span style={{color: '#3182CE', fontWeight: 'bold'}}>{vitals.baseHz} Hz</span></p>
                <p>VMT Micro-Tremor Stress: <span style={{fontWeight: 'bold', color: vitals.stress > 25 ? '#E53E3E' : '#38A169'}}>{vitals.stress}%</span></p>
                <p>Chakra Energy Center: <span style={{color: '#805AD5', fontWeight: 'bold'}}>{vitals.chakra}</span></p>
                <p>Vocal Jitter / Shimmer Variance: <span style={{fontWeight: 'bold'}}>{vitals.jitter} / {vitals.shimmer}</span></p>
              </div>
              <div style={{ borderLeft: '1px solid #E2E8F0', paddingLeft: '40px' }}>
                <h3>Neurological State</h3>
                <p>Facial Core Emotion: <span style={{color: '#DD6B20', fontWeight: 'bold'}}>{neuroFace.emotion}</span></p>
                <p>Hyperactive Brain Cortex: {neuroFace.brainRegion}</p>
                <p>AI Rec. Calibrated Target: <span style={{color: '#ED8936', fontWeight: 'bold'}}>{aiTargetHz} Hz</span></p>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div style={styles.card}>
              <h4 style={{ color: '#2B6CB0', margin: '0 0 10px 0' }}>📈 Voice Frequency Waveform (Amplitude vs Time)</h4>
              <div style={{ width: '100%', height: 140 }}>
                <ResponsiveContainer width="99%" height={110}>
                  <LineChart data={graphsData.waveform}><XAxis dataKey="time" hide /><YAxis fontSize={9} stroke="#A0AEC0" /><Tooltip /><Line type="monotone" dataKey="amplitude" stroke="#3182CE" dot={false} strokeWidth={1.2} /></LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={styles.card}>
              <h4 style={{ color: '#2B6CB0', margin: '0 0 10px 0' }}>📊 Audio MFCC Energy Spectrum (Mood Signature)</h4>
              <div style={{ width: '100%', height: 140 }}>
                <ResponsiveContainer width="99%" height={110}>
                  <BarChart data={graphsData.mfcc}><XAxis dataKey="coef" fontSize={8} stroke="#A0AEC0" /><YAxis fontSize={9} stroke="#A0AEC0" /><Tooltip /><Bar dataKey="value" fill="#DD6B20" radius={[2, 2, 0, 0]} /></BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <h4 style={{ color: '#2B6CB0', margin: '0 0 10px 0' }}>🔥 Mel-Spectrogram Heatmap (Frequency Distribution)</h4>
            <div style={{ width: '100%', height: 130 }}>
              <ResponsiveContainer width="99%" height={100}>
                <AreaChart data={graphsData.spectrogram}><XAxis dataKey="hz" fontSize={8} stroke="#A0AEC0" /><YAxis fontSize={9} stroke="#A0AEC0" /><Tooltip /><Area type="monotone" dataKey="energy" stroke="#805AD5" fill="#E9D8FD" fillOpacity={0.6} /></AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {therapyAudioUrl && (
            <div style={{ ...styles.card, backgroundColor: '#E6FFFA', border: '1px solid #319795' }}>
              <h3 style={{ color: '#319795', marginTop: 0 }}>🎧 AI 8D Therapy Track Ready</h3>
              <audio controls src={therapyAudioUrl} style={{ width: '100%' }} />
            </div>
          )}

          <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
            <div style={{ ...styles.card, flex: 1, marginBottom: 0 }}><h4 style={{ color: '#4A5568', margin: '0 0 5px 0', fontSize: '13px' }}>🗄️ System Engine Status</h4><p style={{fontSize: '12px', color: '#718096', margin: 0}}>SQLite Engine Interlock Active. Safe-state matrix operating perfectly.</p></div>
            <div style={{ ...styles.card, width: '240px', marginBottom: 0, backgroundColor: '#EDF2F7', border: '1px solid #CBD5E0' }}>
              <h3 style={{ color: '#4A5568', marginTop: 0, fontSize: '14px', fontWeight: 'bold' }}>🛠️ QUICK MODULES</h3>
              <button style={{ ...styles.btn, backgroundColor: '#3182CE', color: 'white', padding: '10px', fontSize: '13px' }} onClick={() => setIsModalOpen(true)}>🗂️ View Master Database</button>
              <button style={{ ...styles.btn, backgroundColor: isPro ? '#4FD1C5' : '#A0AEC0', color: 'white', padding: '10px', fontSize: '13px', cursor: isPro ? 'pointer' : 'not-allowed' }} disabled={!isPro}>
                {isPro ? "📊 Advanced Analytics" : "🔒 Advanced Analytics (Pro)"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 🔴 අලුත්: Doctor Profile Edit Modal එක (Password Field එකත් එක්ක) */}
      {isProfileOpen && (
        <div style={{...styles.modalOverlay, zIndex: 3000}}>
          <div style={{...styles.modalContent, maxWidth: '500px'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#2B6CB0', margin: 0 }}>👤 Edit My Profile</h2>
              <button onClick={() => setIsProfileOpen(false)} style={{ backgroundColor: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer' }}>❌</button>
            </div>
            <form onSubmit={handleProfileSave}>
              <p style={{fontSize: '12px', color: '#718096', margin: '0 0 10px 0'}}>Login Email: <strong>{doctorProfile.email}</strong> (Cannot be changed)</p>
              
              <label style={{fontSize: '13px', fontWeight: 'bold', color: '#4A5568'}}>Full Name</label>
              <input style={styles.input} value={doctorProfile.full_name} onChange={e => setDoctorProfile({...doctorProfile, full_name: e.target.value})} required/>
              
              <label style={{fontSize: '13px', fontWeight: 'bold', color: '#4A5568'}}>NIC Number</label>
              <input style={styles.input} value={doctorProfile.nic_number} onChange={e => setDoctorProfile({...doctorProfile, nic_number: e.target.value})} required/>
              
              <label style={{fontSize: '13px', fontWeight: 'bold', color: '#4A5568'}}>Mobile Number</label>
              <input style={styles.input} value={doctorProfile.mobile_number} onChange={e => setDoctorProfile({...doctorProfile, mobile_number: e.target.value})} required/>
              
              <label style={{fontSize: '13px', fontWeight: 'bold', color: '#4A5568'}}>Address</label>
              <input style={styles.input} value={doctorProfile.address} onChange={e => setDoctorProfile({...doctorProfile, address: e.target.value})} required/>
              
              <label style={{fontSize: '13px', fontWeight: 'bold', color: '#4A5568'}}>Clinic Name</label>
              <input style={styles.input} value={doctorProfile.clinic_name} onChange={e => setDoctorProfile({...doctorProfile, clinic_name: e.target.value})} required/>
              
              <hr style={{border: '0', borderTop: '1px solid #E2E8F0', margin: '15px 0'}} />
              
              <label style={{fontSize: '13px', fontWeight: 'bold', color: '#E53E3E'}}>🔒 New Password (Leave blank to keep current)</label>
              <input style={styles.input} type="password" placeholder="Type new password here..." value={doctorProfile.password} onChange={e => setDoctorProfile({...doctorProfile, password: e.target.value})} />
              
              <button type="submit" style={{ ...styles.btn, backgroundColor: '#48BB78', color: 'white', marginTop: '15px' }} disabled={loading}>
                💾 Save Changes
              </button>
            </form>
          </div>
        </div>
      )}

      {/* පරණ: Master Database Modal */}
      {isModalOpen && (
        <div style={{...styles.modalOverlay, zIndex: 900}}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#2B6CB0', margin: 0 }}>🗄️ Clinical Patient Grouped Records</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ backgroundColor: '#FC8181', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>❌ Close Database</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead><tr><th style={styles.th}>Patient Distinct Identity</th><th style={styles.th}>Diagnostic Frequency Visited</th><th style={styles.th}>Core Operations</th></tr></thead>
              <tbody>
                {Object.keys(groupedPatients).map((pKey) => {
                  const visits = groupedPatients[pKey]; const isExpanded = expandedPatient === pKey;
                  return (
                    <>
                      <tr key={pKey} style={{ backgroundColor: '#EDF2F7', cursor: 'pointer' }} onClick={() => setExpandedPatient(isExpanded ? null : pKey)}>
                        <td style={styles.td}>👤 <strong>{pKey}</strong></td><td style={styles.td}>{visits.length} Visit Blocks</td><td style={styles.td}><span style={{ color: '#3182CE', fontWeight: 'bold', fontSize: '12px' }}>{isExpanded ? 'Collapse' : 'Expand All Historical Visit Sheets'}</span></td>
                      </tr>
                      {isExpanded && visits.map((row) => (
                        <tr key={row.id} style={{ backgroundColor: '#FFF', borderLeft: '4px solid #3182CE' }}>
                          <td colSpan="2" style={{ ...styles.td, paddingLeft: '30px', fontSize: '12px', lineHeight: '1.6' }}>
                            📅 <strong>Visit Timestamp:</strong> {row.date} | Age Block: {row.age} Yrs | BP: {row.bp_systolic} mmHg<br />
                            📊 <strong>Acoustic Matrix:</strong> {row.user_hz} Hz | Stress: {row.vmt_stress}% | Jitter: {row.jitter} | Shimmer: {row.shimmer}<br />
                            🧠 <strong>Neural Cortex:</strong> Emotion: {row.emotion} | Target: {row.predicted_target} Hz
                          </td>
                          <td style={styles.td}>
                            <button onClick={() => openReportModal(row)} style={{ backgroundColor: '#4FD1C5', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                              👁️ View Medical Report
                            </button>
                          </td>
                        </tr>
                      ))}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* පරණ: Detailed Clinical Report Modal (Full Page Report) */}
      {reportModalOpen && selectedReport && (
        <div style={{ ...styles.modalOverlay, zIndex: 2000 }}>
          <div style={{ ...styles.modalContent, padding: '40px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid #2B6CB0', paddingBottom: '15px', marginBottom: '25px' }}>
              <div>
                <h1 style={{ color: '#2B6CB0', margin: '0 0 5px 0', fontSize: '24px' }}>BIO-SONIC CLINICAL MATRIX REPORT</h1>
                <p style={{ color: '#718096', margin: 0, fontSize: '13px' }}>Authorized Enterprise SaaS Document</p>
              </div>
              <div style={{ textAlign: 'right', fontSize: '13px', color: '#4A5568' }}>
                <p style={{ margin: '0 0 5px 0' }}><strong>Date:</strong> {selectedReport.date}</p>
                <p style={{ margin: 0 }}><strong>Patient Ref:</strong> {selectedReport.name.split(' ').pop()}</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ color: '#2C7A7B', fontSize: '15px', borderBottom: '1px solid #E2E8F0', paddingBottom: '5px' }}>Demographics & Vitals</h3>
                <p style={{ fontSize: '13px', margin: '8px 0' }}><strong>Name:</strong> {selectedReport.name}</p>
                <p style={{ fontSize: '13px', margin: '8px 0' }}><strong>Age:</strong> {selectedReport.age} Years</p>
                <p style={{ fontSize: '13px', margin: '8px 0' }}><strong>Systolic BP:</strong> {selectedReport.bp_systolic} mmHg</p>

                <h3 style={{ color: '#2C7A7B', fontSize: '15px', borderBottom: '1px solid #E2E8F0', paddingBottom: '5px', marginTop: '20px' }}>Neurological Assessment</h3>
                <p style={{ fontSize: '13px', margin: '8px 0' }}><strong>Facial Emotion:</strong> {selectedReport.emotion}</p>
                <p style={{ fontSize: '13px', margin: '8px 0' }}><strong>Active Brain Cortex:</strong> {selectedReport.brain_region}</p>
                <p style={{ fontSize: '13px', margin: '8px 0' }}><strong>Geo-Location:</strong> {selectedReport.geo_location}</p>
              </div>

              <div style={{ backgroundColor: '#F7FAFC', padding: '15px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <h3 style={{ color: '#2C7A7B', fontSize: '15px', borderBottom: '1px solid #CBD5E0', paddingBottom: '5px', marginTop: 0 }}>Quantum Acoustic Biomarkers</h3>
                <p style={{ fontSize: '13px', margin: '8px 0' }}><strong>Base Frequency:</strong> <span style={{ color: '#3182CE', fontWeight: 'bold' }}>{selectedReport.user_hz} Hz</span></p>
                <p style={{ fontSize: '13px', margin: '8px 0' }}><strong>VMT Stress Ratio:</strong> <span style={{ color: selectedReport.vmt_stress > 25 ? '#E53E3E' : '#38A169', fontWeight: 'bold' }}>{selectedReport.vmt_stress}%</span></p>
                <p style={{ fontSize: '13px', margin: '8px 0' }}><strong>Chakra Resonance:</strong> {selectedReport.blocked_chakra}</p>
                <p style={{ fontSize: '13px', margin: '8px 0' }}><strong>Vocal Jitter:</strong> {selectedReport.jitter}</p>
                <p style={{ fontSize: '13px', margin: '8px 0' }}><strong>Vocal Shimmer:</strong> {selectedReport.shimmer}</p>
                <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#E6FFFA', borderLeft: '4px solid #319795' }}>
                  <p style={{ fontSize: '13px', margin: 0, color: '#285E61' }}><strong>AI Target Calibration:</strong> {selectedReport.predicted_target} Hz</p>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '2px solid #E2E8F0', paddingTop: '15px', marginBottom: '20px' }}>
              <h3 style={{ color: '#2C7A7B', fontSize: '15px', marginBottom: '15px' }}>Clinical Spectrum Matrices (Current Buffer)</h3>
              {graphsData.waveform.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  
                  <div style={{ height: '140px', backgroundColor: '#F7FAFC', border: '1px solid #E2E8F0', padding: '10px', borderRadius: '6px', overflow: 'hidden' }}>
                    <p style={{fontSize: '11px', fontWeight: 'bold', color: '#4A5568', margin: '0 0 5px 0'}}>Waveform Amplitude</p>
                    <LineChart width={360} height={100} data={graphsData.waveform}><XAxis dataKey="time" hide /><YAxis fontSize={8} /><Line type="monotone" dataKey="amplitude" stroke="#3182CE" dot={false} strokeWidth={1} /></LineChart>
                  </div>
                  
                  <div style={{ height: '140px', backgroundColor: '#F7FAFC', border: '1px solid #E2E8F0', padding: '10px', borderRadius: '6px', overflow: 'hidden' }}>
                    <p style={{fontSize: '11px', fontWeight: 'bold', color: '#4A5568', margin: '0 0 5px 0'}}>MFCC Mood Signature</p>
                    <BarChart width={360} height={100} data={graphsData.mfcc}><XAxis dataKey="coef" hide /><YAxis fontSize={8} /><Bar dataKey="value" fill="#DD6B20" /></BarChart>
                  </div>

                  <div style={{ height: '140px', backgroundColor: '#F7FAFC', border: '1px solid #E2E8F0', padding: '10px', borderRadius: '6px', gridColumn: 'span 2', overflow: 'hidden' }}>
                    <p style={{fontSize: '11px', fontWeight: 'bold', color: '#4A5568', margin: '0 0 5px 0'}}>Mel-Spectrogram Heatmap</p>
                    <AreaChart width={750} height={100} data={graphsData.spectrogram}><XAxis dataKey="hz" hide /><YAxis fontSize={8} /><Area type="monotone" dataKey="energy" stroke="#805AD5" fill="#E9D8FD" /></AreaChart>
                  </div>

                </div>
              ) : (
                <p style={{ fontSize: '13px', color: '#A0AEC0', fontStyle: 'italic' }}>Please run a live voice scan to populate graphs in the matrix.</p>
              )}
            </div>

            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '15px' }}>
              <h4 style={{ color: '#E53E3E', fontSize: '14px', margin: '0 0 10px 0' }}>Actionable Clinical Roadmap:</h4>
              <ul style={{ fontSize: '12px', color: '#4A5568', paddingLeft: '20px', margin: 0 }}>
                <li style={{ marginBottom: '5px' }}>Administer custom-synthesized 8D Solfeggio sound treatment 20 minutes daily via stereo headphones.</li>
                <li style={{ marginBottom: '5px' }}>Guard environmental dB levels; preserve auditory resting periods below 60 decibels.</li>
                <li>Conduct repeat voice biomarker spectrum sweep within 7 clinical calendar days.</li>
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '30px' }}>
              <button onClick={() => setReportModalOpen(false)} style={{ backgroundColor: '#A0AEC0', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                ❌ Exit Viewer
              </button>
              <button onClick={() => executePdfPrint(selectedReport.name, selectedReport.age, selectedReport.bp_systolic, selectedReport.user_hz, selectedReport.vmt_stress, selectedReport.blocked_chakra, selectedReport.emotion, selectedReport.brain_region, selectedReport.jitter, selectedReport.shimmer, selectedReport.geo_location, selectedReport.circadian_phase, selectedReport.date, selectedReport.predicted_target)} 
                style={{ backgroundColor: '#48BB78', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                🖨️ Print Report (Save Local)
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default App;
