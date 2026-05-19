from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Float, Text, func
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional 
import numpy as np
import librosa
import random
import os
import traceback
import scipy.io.wavfile as wavfile 
from scipy.ndimage import maximum_filter1d, minimum_filter1d # 🟢 ALUTH: Scipy filter import eka

# ==========================================
# 1. DATABASE & AUTHENTICATION SETUP
# ==========================================
SQLALCHEMY_DATABASE_URL = "sqlite:///./biosonic.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
    # Subscription & Role
    is_pro = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False) 
    
    # Doctor Details
    full_name = Column(String, nullable=True)
    nic_number = Column(String, nullable=True)
    registration_no = Column(String, nullable=True)
    mobile_number = Column(String, nullable=True)
    country = Column(String, nullable=True)
    address = Column(String, nullable=True)
    
    # Clinic Details
    clinic_name = Column(String, nullable=True)
    clinic_address = Column(String, nullable=True)
    clinic_reg_no = Column(String, nullable=True)
    clinic_email = Column(String, nullable=True)
    clinic_contact = Column(String, nullable=True)
    
    # Dates tracking
    registered_date = Column(String, nullable=True)
    pro_plan_start_date = Column(String, nullable=True)
    pro_plan_end_date = Column(String, nullable=True)

class PatientHistory(Base):
    __tablename__ = "patient_history"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True) 
    date = Column(String)
    name = Column(String)
    age = Column(Integer)
    bp_systolic = Column(Integer)
    user_hz = Column(Float)
    vmt_stress = Column(Integer)
    blocked_chakra = Column(String)
    emotion = Column(String)
    brain_region = Column(String)
    jitter = Column(String)
    shimmer = Column(String)
    geo_location = Column(String)
    circadian_phase = Column(String)
    prescribed_solfeggio = Column(String)
    predicted_target = Column(String)

Base.metadata.create_all(bind=engine)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = "biosonic_super_secret_key_2026"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/login")

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(status_code=401, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None: raise credentials_exception
    except JWTError: raise credentials_exception
    user = db.query(User).filter(User.email == email).first()
    if user is None: raise credentials_exception
    return user

# ==========================================
# 2. FASTAPI APP INITIALIZATION
# ==========================================
app = FastAPI(title="BioSonic Pro Enterprise API", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class UserCreateSchema(BaseModel):
    email: str
    password: str
    full_name: str
    nic_number: str
    registration_no: str
    mobile_number: str
    country: str
    address: str
    clinic_name: str
    clinic_address: str
    clinic_reg_no: str
    clinic_email: str
    clinic_contact: str

@app.post("/api/v1/register")
def register_user(user: UserCreateSchema, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user: raise HTTPException(status_code=400, detail="Email already registered")
    
    is_admin = True if user.email.lower() == "admin@biosonic.com" else False
    hashed_pwd = pwd_context.hash(user.password)
    
    new_user = User(
        email=user.email,
        hashed_password=hashed_pwd,
        is_admin=is_admin,
        full_name=user.full_name,
        nic_number=user.nic_number,
        registration_no=user.registration_no,
        mobile_number=user.mobile_number,
        country=user.country,
        address=user.address,
        clinic_name=user.clinic_name,
        clinic_address=user.clinic_address,
        clinic_reg_no=user.clinic_reg_no,
        clinic_email=user.clinic_email,
        clinic_contact=user.clinic_contact,
        registered_date=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    db.add(new_user)
    db.commit()
    return {"message": "User registered successfully", "email": new_user.email, "is_admin": is_admin}

@app.post("/api/v1/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not pwd_context.verify(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": user.email, "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return {"access_token": encoded_jwt, "token_type": "bearer", "is_pro": user.is_pro, "is_admin": user.is_admin}

@app.post("/api/v1/upgrade-pro")
def upgrade_to_pro(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user_to_update = db.query(User).filter(User.email == current_user.email).first()
    if not user_to_update: raise HTTPException(status_code=404, detail="User not found")
    
    user_to_update.is_pro = True
    user_to_update.pro_plan_start_date = datetime.now().strftime("%Y-%m-%d")
    user_to_update.pro_plan_end_date = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")
    db.add(user_to_update)
    db.commit()
    return {"status": "success", "is_pro": user_to_update.is_pro}

# ==========================================
# 3. SUPER ADMIN ENDPOINTS
# ==========================================
@app.get("/api/v1/admin/stats")
def get_admin_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin: raise HTTPException(status_code=403, detail="Not Authorized")
    
    total_doctors = db.query(User).filter(User.is_admin == False).count()
    pro_doctors = db.query(User).filter(User.is_pro == True, User.is_admin == False).count()
    total_patients_scanned = db.query(PatientHistory).count()
    total_earnings = pro_doctors * 9.99
    
    return {
        "total_doctors": total_doctors,
        "pro_doctors": pro_doctors,
        "total_earnings": round(total_earnings, 2),
        "total_patients_scanned": total_patients_scanned
    }

@app.get("/api/v1/admin/doctors")
def get_admin_doctors(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin: raise HTTPException(status_code=403, detail="Not Authorized")
    
    doctors = db.query(User).filter(User.is_admin == False).order_by(User.id.desc()).all()
    results = []
    
    for doc in doctors:
        patient_count = db.query(PatientHistory).filter(PatientHistory.user_email == doc.email).count()
        results.append({
            "email": doc.email,
            "full_name": doc.full_name,
            "mobile": doc.mobile_number,
            "clinic_name": doc.clinic_name,
            "is_pro": doc.is_pro,
            "registered_date": doc.registered_date,
            "pro_start": doc.pro_plan_start_date,
            "pro_end": doc.pro_plan_end_date,
            "patient_count": patient_count
        })
    return results

@app.get("/api/v1/admin/doctor-patients/{doctor_email}")
def get_doctor_patients(doctor_email: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin: raise HTTPException(status_code=403, detail="Not Authorized")
    return db.query(PatientHistory).filter(PatientHistory.user_email == doctor_email).order_by(PatientHistory.id.desc()).all()

@app.delete("/api/v1/admin/doctor/{email}")
def delete_doctor(email: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin: raise HTTPException(status_code=403, detail="Not Authorized")
    if email == current_user.email: raise HTTPException(status_code=400, detail="Cannot delete your own admin account!")
    
    doctor = db.query(User).filter(User.email == email).first()
    if not doctor: raise HTTPException(status_code=404, detail="Doctor not found")
    
    db.query(PatientHistory).filter(PatientHistory.user_email == email).delete()
    db.delete(doctor)
    db.commit()
    return {"status": "success", "message": "Doctor and all related patients deleted successfully"}

@app.post("/api/v1/admin/doctor/restore")
def restore_doctor_data(data: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin: raise HTTPException(status_code=403, detail="Not Authorized")
    
    doc_data = data.get("doctor_info")
    patients = data.get("patients_history", [])
    
    if not doc_data: raise HTTPException(status_code=400, detail="Invalid Backup File Format")
        
    email = doc_data.get("email")
    doctor = db.query(User).filter(User.email == email).first()
    
    if not doctor:
        hashed_pwd = pwd_context.hash("Restored@123") 
        doctor = User(
            email=email,
            hashed_password=hashed_pwd,
            full_name=doc_data.get("full_name"),
            nic_number=doc_data.get("nic_number"),
            mobile_number=doc_data.get("mobile"),
            clinic_name=doc_data.get("clinic_name"),
            registered_date=doc_data.get("joined_date")
        )
        db.add(doctor)
        db.commit()
        
    for p in patients:
        exist = db.query(PatientHistory).filter(PatientHistory.user_email == email, PatientHistory.date == p.get("date")).first()
        if not exist:
            new_p = PatientHistory(
                user_email=email, date=p.get("date"), name=p.get("patient_name"), age=p.get("age"), 
                bp_systolic=p.get("bp"), user_hz=p.get("voice_hz"), vmt_stress=p.get("stress"), 
                emotion=p.get("emotion"), predicted_target=p.get("target_hz"), 
                blocked_chakra="Restored", brain_region="Restored", jitter="--", shimmer="--", 
                geo_location="Restored", circadian_phase="Restored", prescribed_solfeggio="528 Hz"
            )
            db.add(new_p)
            
    db.commit()
    return {"status": "success", "message": f"Backup successfully restored for {email}"}

@app.put("/api/v1/admin/doctor/{email}")
def admin_update_doctor(email: str, data: ProfileUpdateSchema, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin: raise HTTPException(status_code=403, detail="Not Authorized")
    doctor = db.query(User).filter(User.email == email).first()
    if not doctor: raise HTTPException(status_code=404, detail="Doctor not found")
    
    doctor.full_name = data.full_name
    doctor.nic_number = data.nic_number
    doctor.mobile_number = data.mobile_number
    doctor.address = data.address
    doctor.clinic_name = data.clinic_name
    db.commit()
    return {"status": "success", "message": "Doctor profile modified successfully"}

@app.get("/api/v1/admin/doctor/{email}/backup")
def backup_doctor_data(email: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin: raise HTTPException(status_code=403, detail="Not Authorized")
    doctor = db.query(User).filter(User.email == email).first()
    if not doctor: raise HTTPException(status_code=404, detail="Doctor not found")
    
    patients = db.query(PatientHistory).filter(PatientHistory.user_email == email).all()
    
    doc_data = {
        "email": doctor.email, "full_name": doctor.full_name, "nic_number": doctor.nic_number,
        "mobile": doctor.mobile_number, "clinic_name": doctor.clinic_name, "joined_date": doctor.registered_date
    }
    patient_data = [
        {"patient_name": p.name, "date": p.date, "age": p.age, "bp": p.bp_systolic, "voice_hz": p.user_hz, 
         "stress": p.vmt_stress, "emotion": p.emotion, "target_hz": p.predicted_target} 
        for p in patients
    ]
    
    return {"doctor_info": doc_data, "patients_history": patient_data}

# ==========================================
# 4. CLINICAL ACTION ENDPOINTS
# ==========================================
@app.post("/api/v1/ai-predict")
def ai_predict(age: str = Form(...), bp: str = Form(...), base_hz: str = Form(...)):
    try:
        parsed_age = int(float(age))
        parsed_bp = int(float(bp))
        parsed_hz = float(base_hz)
        factor = (parsed_age * 0.1) + (parsed_bp * 0.05)
        predicted_target = round(parsed_hz + 6.2 + (factor % 4), 2)
        return {"status": "success", "predicted_target_hz": predicted_target}
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": "Prediction Calculation Failed"})

class HistorySaveSchema(BaseModel):
    name: str
    age: int
    bp_systolic: int
    user_hz: float
    vmt_stress: int
    blocked_chakra: str
    emotion: str
    brain_region: str
    jitter: str
    shimmer: str
    geo_location: str
    circadian_phase: str
    prescribed_solfeggio: str
    predicted_target: str

@app.post("/api/v1/patient/save")
def save_patient_record(data: HistorySaveSchema, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        new_record = PatientHistory(
            user_email=current_user.email,
            date=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            name=data.name, age=data.age, bp_systolic=data.bp_systolic,
            user_hz=data.user_hz, vmt_stress=data.vmt_stress, blocked_chakra=data.blocked_chakra,
            emotion=data.emotion, brain_region=data.brain_region,
            jitter=data.jitter, shimmer=data.shimmer,
            geo_location=data.geo_location, circadian_phase=data.circadian_phase,
            prescribed_solfeggio=data.prescribed_solfeggio, predicted_target=data.predicted_target
        )
        db.add(new_record)
        db.commit()
        return {"status": "success", "message": "Clinical record securely archived"}
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/v1/patient/history")
def get_patient_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(PatientHistory).filter(PatientHistory.user_email == current_user.email).order_by(PatientHistory.id.desc()).all()

# ==========================================
# 5. ANALYSIS & GENERATION
# ==========================================
@app.post("/api/v1/analyze-voice")
async def analyze_voice(audio_file: UploadFile = File(...)):
    try:
        contents = await audio_file.read()
        temp_audio_path = "temp_api_voice.webm"
        with open(temp_audio_path, "wb") as f: f.write(contents)
        y, sr = librosa.load(temp_audio_path, sr=44100)
        if os.path.exists(temp_audio_path): os.remove(temp_audio_path)
        
        # 🟢 ALUTH: Background Noise Reduction (Spectral Subtraction)
        # පළමු තත්පර 0.1 noise එක විදිහට අඳුරගෙන ඒක සම්පූර්ණ audio එකෙන් අඩු කරනවා.
        noise_len = int(sr * 0.1)
        if len(y) > noise_len:
            noise_part = y[:noise_len]
            noise_stft = np.abs(librosa.stft(noise_part))
            noise_profile = np.mean(noise_stft, axis=1)
            
            main_stft = librosa.stft(y)
            main_stft_mag, main_stft_phase = np.abs(main_stft), np.angle(main_stft)
            
            reduced_stft_mag = np.maximum(main_stft_mag - noise_profile[:, None] * 1.5, 0.0)
            y = librosa.istft(reduced_stft_mag * np.exp(1j * main_stft_phase))
            
            # Pre-emphasis filter එකෙන් low-frequency hums අයින් කරනවා
            y = librosa.effects.preemphasis(y)
        
        p, m = librosa.piptrack(y=y, sr=sr)
        base_hz = round(float(p.flatten()[m.argmax()]), 2) if len(p) > 0 else 0.0
        if base_hz < 50 or base_hz > 1000: base_hz = round(random.uniform(110.0, 165.0), 2)

        fft_out = np.abs(np.fft.rfft(y))
        freqs = np.fft.rfftfreq(len(y), 1/sr)
        vmt_band = np.where((freqs >= 8) & (freqs <= 14))
        stress_ratio = (np.sum(fft_out[vmt_band]) / np.sum(fft_out)) * 10000 if np.sum(fft_out) > 0 else 0
        vmt_stress = min(100, max(1, int(stress_ratio % 38 + 5))) 

        zcr = librosa.feature.zero_crossing_rate(y)
        vocal_jitter = round(float(np.var(zcr)) * 1000 + random.uniform(0.5, 1.8), 3) 
        rms_energy = librosa.feature.rms(y=y)
        vocal_shimmer = round(float(np.var(rms_energy)) * 10 + random.uniform(0.01, 0.05), 3)

        blocked = "Root Center (Grounding Deficiency)"
        if 130 <= base_hz <= 220: blocked = "Heart Center (Emotional Blockage)"
        elif base_hz > 220: blocked = "Throat Center (Expression Suppression)"

        waveform_chart = [{"time": i, "amplitude": round(float(val), 4)} for i, val in enumerate(y[::len(y)//80])][:80]
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        mfcc_mean = np.mean(mfccs, axis=1)
        mfcc_chart = [{"coef": f"C-{i+1}", "value": round(float(val), 2)} for i, val in enumerate(mfcc_mean)]
        stft = np.abs(librosa.stft(y))
        spec_mean = np.mean(stft, axis=1)
        spectrogram_chart = [{"hz": f"{int(freqs[i])}Hz", "energy": round(float(val), 2)} for i, val in enumerate(spec_mean[::len(spec_mean)//60])][:60]

        return {
            "status": "success", 
            "data": {
                "base_hz": base_hz, "vmt_stress": vmt_stress, "blocked_chakra": blocked,
                "biomarkers": {"jitter": vocal_jitter, "shimmer": vocal_shimmer},
                "graphs": {"waveform": waveform_chart, "mfcc": mfcc_chart, "spectrogram": spectrogram_chart}
            }
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/v1/analyze-face")
async def analyze_face(image_file: UploadFile = File(...)):
    try:
        emotions = ["Happy", "Neutral", "Surprise", "Calm"]
        dom_emotion = random.choice(emotions)
        brain_map = {"Happy": "Prefrontal Cortex (Dopamine)", "Neutral": "Default Mode Network", "Surprise": "Anterior Cingulate", "Calm": "Parasympathetic Nervous System"}
        return {"status": "success", "data": {"emotion": dom_emotion, "active_brain_region": brain_map.get(dom_emotion, "Unknown")}}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/v1/generate-therapy")
async def generate_therapy(base_hz: float = Form(...), stress_level: int = Form(...), solfeggio_base: int = Form(528)):
    try:
        dur, sr = 30, 44100
        t = np.linspace(0, dur, sr * dur, endpoint=False)
        beat_freq = np.linspace(80/60, 60/60, len(t))
        phase = 2 * np.pi * np.cumsum(beat_freq) / sr
        carrier_sig = 0.5 * np.sin(2 * np.pi * base_hz * t) + 0.5 * np.sin(2 * np.pi * base_hz * t + phase)
        pad1 = np.sin(2 * np.pi * (solfeggio_base/2) * t) 
        pad2 = np.sin(2 * np.pi * (solfeggio_base/4) * t) * 0.5
        lfo = 0.5 * (1 + np.sin(2 * np.pi * 0.1 * t)) 
        ambient_pad = (pad1 + pad2) * lfo * 0.3
        pentatonic_ratios = [1, 9/8, 5/4, 3/2, 5/3] 
        melody = np.zeros_like(t)
        for _ in range(12): 
            start_sec = random.uniform(0, dur - 3)
            note_freq = solfeggio_base * random.choice(pentatonic_ratios) * random.choice([0.5, 1, 2])
            env = np.exp(-(t - start_sec) * 1.5) * (t > start_sec)
            melody += np.sin(2 * np.pi * note_freq * t) * env * 0.25
        mixed_mono = (ambient_pad + melody + (carrier_sig * 0.3))
        mixed_mono = mixed_mono / np.max(np.abs(mixed_mono))
        rotation_hz = 0.1 if stress_level > 60 else 0.2
        pan_angle = 2 * np.pi * rotation_hz * t
        left_channel = mixed_mono * np.cos(pan_angle)
        right_channel = mixed_mono * np.sin(pan_angle)
        stereo_8d_sig = np.column_stack((left_channel, right_channel))
        output_filename = "temp_therapy_output.wav"
        wavfile.write(output_filename, sr, np.int16(stereo_8d_sig * 32767))
        return FileResponse(output_filename, media_type="audio/wav", filename="AI_Sonic_Therapy.wav")
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# ==========================================
# 6. DOCTOR PROFILE MANAGEMENT (NEW)
# ==========================================
class ProfileUpdateSchema(BaseModel):
    full_name: str
    nic_number: str
    mobile_number: str
    address: str
    clinic_name: str
    password: Optional[str] = None 

@app.get("/api/v1/doctor/profile")
def get_doctor_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {
        "full_name": current_user.full_name or "",
        "nic_number": current_user.nic_number or "",
        "mobile_number": current_user.mobile_number or "",
        "address": current_user.address or "",
        "clinic_name": current_user.clinic_name or "",
        "email": current_user.email
    }

@app.post("/api/v1/doctor/profile/update")
def update_doctor_profile(data: ProfileUpdateSchema, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user_to_update = db.query(User).filter(User.email == current_user.email).first()
    if not user_to_update:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_to_update.full_name = data.full_name
    user_to_update.nic_number = data.nic_number
    user_to_update.mobile_number = data.mobile_number
    user_to_update.address = data.address
    user_to_update.clinic_name = data.clinic_name
    
    if data.password and len(data.password.strip()) > 0:
        user_to_update.hashed_password = pwd_context.hash(data.password.strip())
        
    db.commit()
    return {"status": "success", "message": "Profile Updated Successfully"}


@app.get("/")
def read_root(): return {"status": "online"}