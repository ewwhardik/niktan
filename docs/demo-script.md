# 3-Minute Hackathon Demo Script (Hackasol 5.0)

> **Total Duration:** 3 minutes (180 seconds)  
> **Target Audience:** Hackathon Judges, Clinical Faculty, and Peer Teams  
> **Team Setup:**  
> - **Presenter 1:** Narrator with microphone and laptop showing the **Hospital Triage Board**.  
> - **Presenter 2:** Live user holding mobile phone (screen-mirrored or projected) running the **Citizen Scan Flow**.  
> - **Props:** Pulse oximeter or smartwatch for live heart rate verification; plate of lunch/canteen food for Thali scan.

---

## Timeline & Talking Points

Open the [production app](https://niktan.vercel.app/) on the phone and the [staff sign-in page](https://niktan.vercel.app/hospital) on the laptop. The [product walkthrough](product-tour.md) shows the screens in order. Use **Health Card** on the home page to reopen a saved screening, and use simulated visits for the staff demonstration.

### [0:00 – 0:25] The Hook: The Two-Hour Wait for a Five-Minute Consult
- *"Good afternoon judges. Raise your hand if you or your family have ever waited 2 to 3 hours in a government hospital OPD just to see the doctor for barely 5 minutes."*
- *"India’s ABDM Scan & Share was a massive triumph—it cut registration queues from 1 hour to 2 minutes. But it stopped right there. Once you have a token, you still wait in a single, blind, first-come queue. A breathless hypertensive patient waits behind 15 routine checkups, and when they finally see the doctor, the doctor spends half the consult asking basic questions."*
- *"Meet NikTan: Your phone is the first checkup, and the OPD knows you before you arrive."*

---

### [0:25 – 1:15] The Live Citizen Scan: Phone Becomes a Medical Scanner
- *"Watch this: My teammate is opening NikTan on their phone. No app download—it runs in Chrome. Notice the language toggle: Hindi, English, and authentic Chhattisgarhi."*
- *(Presenter 2 opens camera for Face Vitals)*
  - *"Step 1: Face Vitals. In 30 seconds, using the POS rPPG algorithm inside WebAssembly, our code detects micro-capillary color fluctuations across the forehead and cheeks. Look at the live pulse waveform synchronizing right now on screen."*
  - *(Compare with pulse oximeter: 'NikTan reads 74 bpm, the finger oximeter reads 73 bpm. Zero hardware cost.')*
- *(Presenter 2 demonstrates Eye Scan)*
  - *"Step 2: Eye Scan. Pull down the lower eyelid. Our on-device MediaPipe pipeline crops the palpebral conjunctiva, extracts 11 color features, and evaluates pallor risk to catch silent anemia before the patient ever sees a needle."*

---

### [1:15 – 1:45] The Red-Flag Moment: Voice to Priority Triage
- *(Presenter 2 taps Push-to-Talk and speaks)*
  - *Voice line:* **"सीने में दर्द हो रहा है और बहुत तेज साँस फूल रही है।"** ("Chest pain and severe breathlessness.")
- *"Our multi-tiered AI pipeline transcribes the Hindi speech, validates symptoms against a fixed clinical dictionary, and triggers our safety confirmation."*
- *(Screen instantly updates to 🔴 EMERGENCY)*
  - *"Notice what just happened: It didn't just give an advice card. It recognized an acute cardiac red flag and immediately surfaced a direct one-tap call to 108 with the instruction to go to the Emergency Department now. This patient does not join the OPD queue."*
  - *(Presenter 1 points to the laptop screen showing `/hospital/board` after staff sign-in)*:
    *"On the hospital board, the hidden-emergency SIMULATED scenario is shown at the top: a simulated chest-pain patient who arrived 15th."*

---

### [1:35 – 1:45] Your Own Phone on the Board (optional, for a non-emergency run)
- *(Presenter 2 runs a **Quick check** (~3 min) with a see-today symptom, e.g. "5 din se bukhar", taps **Join OPD queue**, ticks **Show my visit on the demo board**, and picks the demo hospital.)*
- *"That visit is now on the hospital board, marked LIVE, sorted above routine patients who arrived before it. Above the board: today's urgent patients against a first-come, first-served line, measured from the queue's own timestamps."*

### [1:45 – 2:20] The Doctor's Pre-Consultation Card & Live Queue
- *(Presenter 1 clicks the token on the Triage Board)*
  - *"When the doctor calls token #15, look at the Pre-Consult Card: Vitals, conjunctival pallor status, Snellen vision score, hearing tier, and AI-structured symptoms are already filled in."*
  - *"Target: this saves 2 to 3 minutes per patient (to be measured at the event), which would recover over 30 doctor-hours every day in a busy district hospital."*

---

### [2:20 – 2:45] NikTan Thali: Closing the Loop with Local Nutrition
- *(Presenter 2 snaps a photo of a meal plate)*
  - *"We don't just screen; we close the loop. NikTan Thali scans the patient's meal, references the Indian Nutrient Databank (INDB) across 70 dishes, and compares nutrients against ICMR-NIN 2020 RDA targets."*
  - *"Because the patient was flagged for pallor and their thali is low in iron, NikTan provides culturally rooted Central Indian dietary swaps: Add Lal Bhaji (red amaranth), Chana, or Bore-Baasi with a vitamin C citrus source."*

---

### [2:45 – 3:00] The Engineering & Scale Summary
- *"Everything you saw runs on free-tier serverless infrastructure (Cloudflare Workers + D1) with edge processing on the phone. Personal biometric images NEVER leave the device."*
- *"Cost per screening at scale? About 2 paise of server cost. It works today, and it will keep working next month because nothing sleeps."*
- *"NikTan: Empowering citizens, unburdening doctors, and saving lives in the OPD queue. Thank you!"*
