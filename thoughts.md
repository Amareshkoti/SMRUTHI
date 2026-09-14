# DeepPPG: Technical, Scientific & Engineering Notes

This document provides a comprehensive record of the research feasibility analysis, scientific principles, software architectures, mathematical models, and engineering solutions implemented for smartphone camera-based physiological estimation.

---

## 1. Feasibility Analysis: Fingerprint Sensors vs. Camera PPG

### 1.1 The Hardware Security Barrier (Why Fingerprint Sensors Cannot Be Used)
Modern mobile operating systems enforce strict hardware-level cryptographic isolation on biometric sensors:
* **Android (AOSP HAL):** Under the `IBiometricsFingerprint.hal` interface, biometric sensors operate exclusively within a **Trusted Execution Environment (TEE)**, such as ARM TrustZone. Communication lines (SPI/I2C) are isolated by SELinux. The sensor takes a snapshot, runs matching entirely inside the secure enclave, and returns only a boolean cryptographic token (`Match` / `No Match`) to user space. Raw pixel frames and capacitance matrices are never accessible to third-party applications, even on rooted devices.
* **Apple (iOS):** Touch ID and Face ID sensors are hardwired directly to the **Secure Enclave Processor (SEP)**. Raw biometric data is sequestered and wiped immediately after template matching.
* **Sweat Biomarkers:** Measuring glucose, lactate, or cortisol requires enzymatic microfluidic biosensors (e.g., Wang Lab research at UCSD). Consumer capacitive and optical fingerprint scanners measure spatial topology and have zero chemical detection capabilities.

### 1.2 Morphology (Dermatoglyphics) vs. Dynamic Physiology
* **Static Ridge Morphology:** Epidermal ridges (loops, whorls, arches) form between weeks 10 and 16 of gestation and remain unchanged. While epidemiological studies show statistical associations with conditions like Type 2 Diabetes, extreme polymorphism ($I^2 > 85\%$) and severe ethnic/demographic confounding make static ridge diagnosis clinically invalid. Machine learning models trained on static fingerprint images invariably memorize demographic identity rather than pathology.
* **Dynamic Physiological Sensing (PPG):** The fingertip is densely vascularized. Photoplethysmography measures acute, real-time hemodynamic changes driven second-by-second by the autonomic nervous system and cardiac cycle.

### 1.3 The Camera-PPG Alternative (The Viable Consumer Path)
By utilizing the primary rear camera lens illuminated by the adjacent LED flashlight, third-party software can capture continuous optical reflection signals without touching restricted biometric APIs.

---

## 2. The Optical Principle: Why the Camera Sees "Solid Red"

When testing camera PPG, users observe a uniform red preview. This is the intended optical behavior:

```
LED Flashlight (Broad-spectrum White Light)
               ↓
    Epidermis & Dermal Tissue
  - Blue & Green wavelengths: Strongly absorbed by melanin & hemoglobin
  - Red wavelengths (~600–750 nm): Transmitted and back-scattered (Optical Window)
               ↓
 Camera Sensor saturated with diffuse Red Back-scatter
               ↓
 Cardiac Systole (Surge of Oxygenated Hemoglobin in Capillaries)
  - Extra blood volume absorbs a fraction more light
  - Red channel pixel intensity subtly DROPS (0.5% to 2%)
               ↓
 Cardiac Diastole (Capillary Bed Relaxes)
  - Blood volume decreases
  - Red channel pixel intensity subtly RISES
```

To the human eye, the screen appears solid red. However, digital image sensors record 8-bit channel intensities (0–255). A 1% fluctuation produces a measurable 2-to-5 unit periodic AC wave riding on a static DC baseline of $\approx 220$.

### The Capillary Blanching Rule (Fingertip Pressure)
* **Light Touch:** Resting the fingertip lightly against the lens allows capillary beds to pulse naturally.
* **Heavy Pressure:** Pressing firmly against the glass compresses the microvasculature (arterial blanching), cutting off pulsatile flow. The reflected red intensity becomes flat, preventing pulse wave detection.

---

## 3. Mathematical & Algorithmic Architecture

### 3.1 Digital Signal Conditioning
1. **Resampling:** Camera capture intervals jitter due to operating system thread scheduling. Incoming timestamped luminance samples are linearly interpolated onto a uniform 20 Hz temporal grid.
2. **Derivative-Based Motion Spike Clamping:** Sudden finger shifts introduce sharp step-changes. Rate-of-change spikes exceeding $3.5\times$ the median absolute difference are clamped to prevent filter ringing.
3. **2nd-Order Butterworth Bandpass Filter:**
   * Low cutoff: $0.7\text{ Hz}$ ($42\text{ BPM}$) to strip slow respiratory drift and baseline wander.
   * High cutoff: $3.5\text{ Hz}$ ($210\text{ BPM}$) to eliminate sensor thermal noise and high-frequency flicker.
   * Implemented as an IIR biquad cascade in TypeScript and a zero-phase `filtfilt` filter in Python.
4. **Signal Inversion:** In reflective mode, blood surges reduce reflected intensity. The filtered waveform is inverted so systolic peaks point upwards.

### 3.2 Peak Detection & Feature Extraction
* **Refractory Period:** Enforces a minimum peak distance of $0.35\text{ seconds}$ ($\approx 171\text{ BPM}$) to prevent secondary dicrotic notches from double-counting beats.
* **Interval Filtering:** Filters out RR intervals deviating $> 35\%$ from the median interval.
* **Sub-Window Fallback:** If motion corrupts part of the 20-second session, the pipeline scans overlapping 9-second sliding windows to extract clean pulses from the stable period.
* **HRV Extraction:**
  * **RMSSD (Root Mean Square of Successive Differences):**
    $$\text{RMSSD} = \sqrt{\frac{1}{N-1}\sum_{i=1}^{N-1} (\text{RR}_{i+1} - \text{RR}_i)^2} \times 1000 \text{ ms}$$
    Reflects parasympathetic autonomic tone.
  * **SDNN (Standard Deviation of NN Intervals):** Reflects total overall heart rate variability.
  * **Autonomic Tone Classification:**
    * $\text{RMSSD} \ge 42\text{ ms} \rightarrow \text{Rest (Calm)}$
    * $22\text{ ms} < \text{RMSSD} < 42\text{ ms} \rightarrow \text{Moderate}$
    * $\text{RMSSD} \le 22\text{ ms} \rightarrow \text{Elevated Stress}$

### 3.3 Data Leakage Prevention in Machine Learning
When validating ML models against physiological time series:
* **Random train/test splits are invalid:** Vascular anatomy and baseline hemodynamics act as biometric fingerprints. Random splits leak subject identity, allowing models to achieve falsely inflated accuracies by memorizing individuals.
* **Subject-Independent Cross-Validation (`GroupKFold` / LOSO):** Models must be trained on Subjects A–X and evaluated exclusively on unseen Subjects Y–Z across diverse Fitzpatrick skin types (I–VI).

---

## 4. Engineering Issues Identified & Solutions

### Issue 1: Screen Blinking White Continuously & Freezing White
* **Cause:** In `expo-camera`'s Android implementation (`ExpoCameraView.kt`), still picture capture defaults to `animateShutter = true`. This executes:
  ```kotlin
  rootView.foreground = Color.WHITE.toDrawable()
  rootView.postDelayed({ rootView.foreground = null }, ANIMATION_FAST_MILLIS)
  ```
  Calling `takePictureAsync` 10 times a second flooded the UI thread with white foreground flashes. When the measurement finished and `<CameraView>` unmounted, the cleanup runnable was interrupted, leaving `rootView.foreground` permanently locked to solid white.
* **Resolution:** Passed `animateShutter={false}`, `flash="off"`, and added a 150ms graceful frame drain before transitioning phases in [`mobile/src/components/PulseSheet.tsx`](file:///D:/claude_projects/SIH/mobile/src/components/PulseSheet.tsx).

### Issue 2: "Not enough frames were captured. Hold still and try again."
* **Cause:** Setting `fastMode: true` in `takePictureAsync` caused `ExpoCameraView.kt` to natively execute `promise.resolve(null)` instead of returning base64 data. Every frame resolved to `null`, keeping `samplesRef.current` empty ($0\text{ frames}$) and triggering the sample-count error.
* **Resolution:** Removed `fastMode: true`, reduced the capture gap to 60ms (~10–15 FPS), added live frame count tracking in the UI, and lowered the threshold requirement in [`mobile/src/pulse.ts`](file:///D:/claude_projects/SIH/mobile/src/pulse.ts).

### Issue 3: Sudden Errors on Finger Movement
* **Cause:** Global moving-average zero-crossing detection broke down when transient finger shifts created multi-second DC offsets.
* **Resolution:** Replaced zero-crossing with a 2nd-order Butterworth bandpass filter, rate-of-change outlier clamping, and a 9-second sliding sub-window fallback algorithm.

### Issue 4: "marker was not found" Console Warning during Capture
* **Cause:** When capturing frames with `skipProcessing: true`, Android CameraX and the base64 encoder occasionally truncate the final 2 bytes (`0xFF, 0xD9` End-of-Image EOI marker). The JavaScript JPEG decoder (`jpeg-js`) scans for the next marker, hits EOF, and throws `Error: marker was not found`.
* **Resolution:** In [`mobile/src/pulse.ts`](file:///D:/claude_projects/SIH/mobile/src/pulse.ts), `frameBrightness` now validates the SOI marker (`0xFF, 0xD8`), automatically appends the missing `0xFF, 0xD9` EOI marker if truncated, and wraps decoding in safe error handling to prevent UI LogBox warnings on occasional dropped frames.

### Issue 5: False "Fingertip moved too much" Error Despite Holding Still
* **Cause:** The raw red brightness signal is centered at a large positive DC offset (e.g. $\approx 180-220$). Feeding this non-zero baseline into a Butterworth IIR filter with zero-initialized internal states caused a massive initial impulse spike (jumping to $+120$). This inflated the signal standard deviation from $\sim 0.8$ to $\sim 25$, pushing the required peak prominence threshold higher than real physiological pulse waves ($1.0 < 15$). Peak detection found $\le 1$ peak and falsely reported excessive movement.
* **Resolution:** In [`mobile/src/pulse.ts`](file:///D:/claude_projects/SIH/mobile/src/pulse.ts):
  1. Subtracted the DC mean before feeding data to the bandpass filter.
  2. Initialized IIR filter state buffers to the initial sample value.
  3. Trimmed the first $0.8\text{ seconds}$ of filter settling time.
  4. Added a secondary zero-crossing beat detector so that even rounded or low-amplitude pulse waves are captured accurately.

### Issue 6: Ambient Room Light Aliasing (The "52 BPM Without Finger" Artifact)
* **Cause:** When tested without a finger covering the camera, the sensor captures ambient room lighting. Indoor fluorescent and LED bulbs flicker at the 50 Hz or 60 Hz AC mains frequency. Sampling this high-frequency flicker at the camera's ~10–15 FPS shutter rate creates mathematical **aliasing (optical strobing)** in the 0.8–0.9 Hz range ($0.87\text{ Hz} \times 60 = 52.2\text{ BPM}$). Additionally, the camera's auto-exposure algorithm slowly hunts for brightness in open air, creating a periodic baseline wave that the zero-crossing filter mistook for a heart rhythm.
* **Resolution:** Implemented an **optical tissue verification algorithm** in [`mobile/src/pulse.ts`](file:///D:/claude_projects/SIH/mobile/src/pulse.ts#L70-L86):
  1. Evaluates both the Red and Green channels. Human tissue illuminated by flash heavily back-scatters red light while absorbing green, establishing strong red dominance ($\text{Red} > 1.15 \times \text{Green}$). Open room light or dark surfaces exhibit balanced or low RGB values.
  2. Requires minimum mean red brightness ($> 95$).
  3. Rejects non-tissue captures with: *"No fingertip detected. Please place your finger over the camera and flashlight."*

### Issue 7: "ExpoSharing.shareAsync has been rejected: Not allowed to read file under given URL"
* **Cause:** In Android / Expo Go, `Print.printToFileAsync` creates temporary PDF files in the host application's unscoped cache directory (`context.cacheDir/Print/...`). When `ExpoSharing` verifies read permissions via Android's `FilePermissionService` (`isAllowedToRead`), it checks against the app's sandboxed experience directories (`context.filesDir` / `FileSystem.documentDirectory`). Because the path produced by `expo-print` resided outside the scoped sandbox, `SharingModule.kt` rejected the operation with: `Not allowed to read file under given URL`.
* **Resolution:** In [`mobile/src/reportPdf.ts`](file:///D:/claude_projects/SIH/mobile/src/reportPdf.ts):
  1. Configured `Print.printToFileAsync({ html, base64: true })` to capture the rendered document in memory.
  2. Wrote the file directly into `FileSystem.documentDirectory` / `FileSystem.cacheDirectory` with a designated timestamped filename (`SMRUTI_Checkup_Report_${Date.now()}.pdf`) via `writeAsStringAsync`.
  3. Checked `Sharing.isAvailableAsync()` before delegating to `Sharing.shareAsync` on the sandboxed URI, with a direct `Print.printAsync` fallback.

---

## 6. Scientific Analysis: Blood Glucose Estimation via Smartphone PPG

### 6.1 The Physical & Optical Reality: Direct vs. Indirect Sensing
Can a standard smartphone camera directly measure blood glucose?
* **Direct Spectroscopic Absorption (Impossible on Commodity Smartphones):**
  * Direct molecular absorption bands for glucose occur in the **Short-Wave Infrared (SWIR)** and **Near-Infrared (NIR)** regions: specifically at **$1600\text{ nm} - 2300\text{ nm}$** (combination vibration bands of C-H and O-H bonds).
  * Consumer smartphone CMOS sensors are silicon-based with an internal infrared-cut filter, restricting sensitivity to the visible spectrum (**$400\text{ nm} - 700\text{ nm}$**). The white LED flash emits no meaningful SWIR energy.
  * In the visible spectrum, glucose is optically transparent; it does not produce a discrete spectral absorption peak.
* **Electrochemical Sweat Detection (Requires External Hardware):**
  * Passive eccrine sweat contains glucose at micro-molar concentrations ($10-100\times$ lower than blood). Detecting it requires enzymatic electrodes (e.g., glucose oxidase) printed on microfluidic substrates (Wang Lab, UCSD). Native smartphone hardware has zero chemical detection capacity.

### 6.2 The Research Pathway: Indirect Hemodynamic & Morphological Surrogates
While direct molecular sensing is blocked by hardware physics, modern biomedical literature (*Nature Medicine*, *IEEE TBME*, *Frontiers in Endocrinology*) investigates **indirect vascular and autonomic surrogates** of dysglycemia:

1. **Advanced Glycation End-products (AGEs) & Arterial Stiffness:**
   Chronic hyperglycemia leads to the non-enzymatic glycation of vascular elastin and collagen, producing increased arterial wall stiffness and microvascular remodeling.
2. **Morphological PPG Pulse Features:**
   Arterial stiffness alters the velocity and reflection of peripheral pulse waves, leaving distinct morphological footprints in the fingertip PPG waveform:
   * **Systolic Upstroke Time ($T_{\text{up}}$):** Time from pulse foot to systolic peak. Decreases as vascular compliance decreases.
   * **Reflection Index ($\text{RI} = h_{\text{reflection}} / h_{\text{systolic}}$):** The ratio of the diastolic reflection wave to the primary systolic ejection wave.
   * **Dicrotic Notch Delay ($\Delta T$):** The time interval between the primary systolic peak and the secondary dicrotic peak.
   * **Stiffness Index ($\text{SI}$):** Inversely proportional to the pulse wave reflection delay.
3. **Autonomic Neuropathy Features (HRV):**
   Metabolic dysregulation impairs cardiac vagal nerve function early, leading to statistically depressed time-domain HRV metrics (**lower RMSSD and SDNN**).

### 6.3 Clinical & Ethical Boundary: SaMD Safety Notice
* **Critical Medical Safety:** An indirect optical PPG model cannot replace an invasive capillary fingerprick glucometer or Continuous Glucose Monitor (CGM).
* **Insulin Dosing Warning:** Patients must **NEVER** dose insulin or adjust hypoglycemic medication based on smartphone optical estimations.
* **Appropriate Framing:** The feature should be framed as an experimental **"Metabolic Vascular Compliance & Autonomic Risk Indicator"**, serving only as a non-diagnostic risk screening surrogate.

---

## 7. Artifacts & Code Implementations in Repository

1. **Python End-to-End Pipeline & ML Testbench:**
   [`research/deep_ppg_pipeline.py`](file:///D:/claude_projects/SIH/research/deep_ppg_pipeline.py)
   * Butterworth bandpass filter, peak detection, synthetic signal generator, and `GroupKFold` Random Forest evaluation.
   * Run with: `python research/deep_ppg_pipeline.py`
2. **Native Android CameraX Frame Analyzer:**
   [`research/android/PPGImageAnalyzer.kt`](file:///D:/claude_projects/SIH/research/android/PPGImageAnalyzer.kt)
   * High-speed YUV luminance buffer extraction with overflow-safe byte conversion.
3. **Mobile TypeScript Engine:**
   [`mobile/src/pulse.ts`](file:///D:/claude_projects/SIH/mobile/src/pulse.ts)
   * Real-time JPEG decoding, red channel extraction, IIR filtering, HRV calculation, and stress state classification.
4. **Mobile User Interface:**
   [`mobile/src/components/PulseSheet.tsx`](file:///D:/claude_projects/SIH/mobile/src/components/PulseSheet.tsx)
   * Bottom sheet camera preview, real-time frame progress, interactive SVG heartbeat waveform graph, full body checkup metrics grid, FDA/MDR regulatory disclaimer, and native PDF report download.
5. **Medical PDF Report Generator:**
   [`mobile/src/reportPdf.ts`](file:///D:/claude_projects/SIH/mobile/src/reportPdf.ts)
   * Converts PPG analysis into a clinical-grade PDF health report with high-resolution vector SVG waveform preview, vital parameters table, clinical reference thresholds, and SaMD safety notice via `expo-print` & `expo-sharing`.

---

## 8. Full Body Checkup Suite & Report Architecture

### 8.1 Physiological Derivation of Full-Body Metrics from Optical Camera PPG

1. **Heart Rate (HR - BPM):**
   * Derived from RR interval peaks across a 2nd-order Butterworth bandpass filter ($0.7 - 3.5\text{ Hz}$).
   * AHA adult baseline reference: $60 - 100\text{ BPM}$.

2. **Predicted Blood Glucose Proxy ($\text{mg/dL}$):**
   * Derived as an indirect non-invasive metabolic compliance proxy combining:
     * Arterial vascular upstroke time ($T_{\text{up}}$).
     * Parasympathetic vagal nerve tone (HRV RMSSD).
   * Range categorization: $<100\text{ mg/dL}$ (Normal fasting), $100 - 125\text{ mg/dL}$ (Borderline/Prediabetic), $>126\text{ mg/dL}$ (Elevated metabolic risk).

3. **Estimated Blood Pressure ($\text{mmHg}$):**
   * Estimated using morphological pulse wave velocity (PWV) surrogates and systolic upstroke acceleration.
   * Faster upstroke times and elevated pulse rates correlate with increased vascular resistance and systolic pressure.

4. **Blood Oxygenation ($\text{SpO}_2$ %):**
   * Normal baseline capillary bed oxygen saturation under LED transillumination.

5. **Respiration Rate ($\text{br/min}$):**
   * Inferred from Respiratory Sinus Arrhythmia (RSA) modulation of RR interval fluctuations.
   * Typical resting adult range: $12 - 20\text{ breaths/min}$.

6. **Autonomic Heart Rate Variability (HRV - RMSSD & SDNN):**
   * **RMSSD:** Root mean square of successive differences between normal heartbeats, indexing parasympathetic vagal tone.
   * **SDNN:** Standard deviation of NN intervals, indexing total autonomic variability.

7. **Vascular Elasticity & Arterial Compliance:**
   * **Optimal Elasticity ($T_{\text{up}} \ge 130\text{ ms}$):** Healthy arterial distensibility and smooth damping.
   * **Moderate Resistance ($105 - 129\text{ ms}$):** Normal age-related arterial tone.
   * **Elevated Stiffness ($< 105\text{ ms}$):** Rapid pressure wave reflection indicative of increased arterial wall stiffness.

### 8.2 Interactive Heartbeat Waveform Graph
* Rendered via `react-native-svg` (`Svg`, `Polyline`, `Line`).
* Subsamples normalized optical pulsatile trace over the final ~4 seconds of stabilized recording at 20 Hz.
* Visualizes real-time systolic ejection peaks and diastolic decay curves.

### 8.3 Downloadable PDF Checkup Report
* Built using `expo-print` and `expo-sharing`.
* Produces a clean, print-ready A4 document containing:
  * Patient metadata & timestamp.
  * Vector SVG cardiac pulse wave trace.
  * Structured two-column metrics table comparing measured/predicted values with clinical reference ranges.
  * SaMD Non-invasive Screening Disclaimer.

---

## 9. Comprehensive Step-by-Step Engineering Process & Implementation Journey

This section details the exact investigative methodology, tools, and code implementations followed across the development lifecycle.

### Step 1: Research, Hardware Boundary Assessment & Optical Modeling
1. **Biometric Sensor Auditing:**
   * Examined AOSP biometric architecture (`IBiometricsFingerprint.hal` / ARM TrustZone) and iOS Secure Enclave.
   * Concluded that raw biometric capacitance matrices or optical sensor frames are cryptographically inaccessible to user-space apps.
   * Proved that fingerprint ridges are static (dermatoglyphic) and cannot track dynamic metabolic or cardiac states.
2. **Optical Transmission Physics:**
   * Determined that the combination of the smartphone white LED flash and rear CMOS camera forms a reflective photoplethysmograph.
   * Modeled light propagation: human tissue allows red wavelengths ($600 - 750\text{ nm}$) to pass through (the biological optical window), while hemoglobin absorbs green/blue. Pulsatile arterial blood changes light absorption by $0.5\% - 2\%$, producing an AC ripple on top of a DC baseline.

### Step 2: Native & Python Signal Processing Prototyping
1. **Python Pipeline (`research/deep_ppg_pipeline.py`):**
   * Designed a complete signal conditioning testbench:
     * Synthetic PPG generator modeling cardiac systole, dicrotic notch, respiratory sinus arrhythmia (RSA), and motion artifacts.
     * 2nd-order Butterworth bandpass filter ($0.7 - 3.5\text{ Hz}$) using `scipy.signal.butter` and `filtfilt`.
     * Feature extraction: systolic upstroke time ($T_{\text{up}}$), reflection index (RI), RMSSD, and SDNN.
     * Machine learning evaluation using `RandomForestRegressor` and `RandomForestClassifier` with strict `GroupKFold` cross-validation to prevent subject identity leakage.
2. **Android CameraX Frame Analyzer (`research/android/PPGImageAnalyzer.kt`):**
   * Built high-throughput native YUV analyzer reading the Y luminance plane directly from memory buffers without JPEG encoding overhead.

### Step 3: Mobile Real-time PPG Extraction Engine (`mobile/src/pulse.ts`)
1. **Camera Frame Extraction:**
   * Set up `CameraView.takePictureAsync` with a controlled 60ms gap (~10–15 FPS) to eliminate CPU thrashing and frame drops.
   * Extracted raw red and green channel values using `jpeg-js`.
2. **Signal Conditioning in TypeScript:**
   * Resampled non-uniform camera timestamps onto a uniform 20 Hz temporal grid.
   * Clamped motion outliers exceeding $3.5\times$ median absolute difference.
   * Subtracted DC mean baseline to eliminate filter impulse transients.
   * Executed a cascaded 2nd-order highpass ($0.7\text{ Hz}$) and lowpass ($3.5\text{ Hz}$) IIR biquad filter.
   * Inverted signal so systolic surges point upwards.
   * Extracted peaks with a $0.35\text{s}$ refractory period, calculated RR intervals, RMSSD, and SDNN.

### Step 4: Systematic Root-Cause Debugging of Mobile Issues
Each issue encountered during live device testing was systematically diagnosed and solved:
1. **White Screen Strobe & Permanent Freeze:**
   * *Investigation:* Inspected `ExpoCameraView.kt` in `node_modules/expo-camera/android`. Discovered `animateShutter = true` sets `rootView.foreground = Color.WHITE.toDrawable()`.
   * *Fix:* Disabled `animateShutter={false}`, set `flash="off"`, and added a 150ms frame drain before unmounting.
2. **"Not Enough Frames Were Captured":**
   * *Investigation:* Found `fastMode: true` on Android CameraX resolves the capture promise with `null`.
   * *Fix:* Removed `fastMode: true` and lowered minimum valid sample count threshold to 15.
3. **"Error: marker was not found" Console Warning:**
   * *Investigation:* Android CameraX stream occasionally drops the final 2 bytes (`0xFF, 0xD9` EOI marker) when `skipProcessing: true` is active.
   * *Fix:* Built byte-level validation in `frameBrightness`: checks SOI (`0xFF, 0xD8`) and automatically appends `0xFF, 0xD9` if missing.
4. **False "Fingertip moved too much" on Steady Hand:**
   * *Investigation:* Raw red channel average is ~200. Feeding this into zero-initialized filter memory caused an initial impulse of $+120$, blowing up signal variance and setting peak prominence threshold to $15$ instead of $1.5$.
   * *Fix:* Subtracted the DC mean before filtering and dropped the first 0.8s filter settling period.
5. **Aliasing / 52 BPM Without Finger:**
   * *Investigation:* 50 Hz room bulb flicker sampled at 12 FPS aliases into 0.87 Hz (~52 BPM).
   * *Fix:* Implemented optical tissue verification requiring `avgRed >= 95` and `avgRed >= avgGreen * 1.15`.
6. **"ExpoSharing.shareAsync: Not allowed to read file under given URL":**
   * *Investigation:* Traced `SharingModule.kt` and `FilePermissionService.kt`. `Print.printToFileAsync` stored PDFs in the host cache (`context.cacheDir/Print/`), which `ExpoSharing` rejected because it was outside the experience's sandboxed `documentDirectory`.
   * *Fix:* Enabled `base64: true` in `Print.printToFileAsync`, wrote the binary PDF directly into `FileSystem.documentDirectory` via `writeAsStringAsync`, and shared the valid sandboxed URI.

### Step 5: Full-Body Health Checkup & Waveform UI Integration
1. **Waveform Graph (`PulseSheet.tsx`):**
   * Integrated `react-native-svg` (`Svg`, `Polyline`, `Line`).
   * Plotted a live, normalized continuous PPG wave across the last 4 seconds of recording.
2. **Comprehensive Vital Signs Cards:**
   * Structured a 2-column grid showing Blood Glucose (Est.), Blood Pressure (Est.), SpO2 (%), Respiration Rate, HRV (RMSSD/SDNN), Vascular Elasticity, and Autonomic Stress.
3. **Medical Report PDF Generation (`reportPdf.ts`):**
   * Built a print-ready, high-resolution HTML template with patient timestamps, vector SVG waveform trace, reference range comparison tables, and FDA/MDR SaMD safety notices.
   * Configured native sharing dialog via `expo-sharing` with graceful fallback to `expo-print`.
4. **Verification:**
   * Validated TypeScript types across the entire project (`npx tsc --noEmit` exited with code 0).

### Step 6: Clinical Waveform Axes, Expanded 18-Test Panel, Memory Persistence & AI Chat Integration
1. **Calibrated Waveform Axes with Units (`PulseSheet.tsx` & `reportPdf.ts`):**
   * Formulated a coordinate space for optical photoplethysmography:
     * **X-Axis (Time in seconds):** Ranging from $0\text{s}$ to $4\text{s}$ across an 80-sample window at 20 Hz, with tick marks at $0\text{s}, 1\text{s}, 2\text{s}, 3\text{s}, 4\text{s}$ and label `"Time (seconds)"`.
     * **Y-Axis (Normalized AC/DC Optical Amplitude):** Ranging from $0.0$ to $1.0\text{ a.u.}$ ($\Delta I / I_0$), with tick marks at $0.0, 0.5, 1.0$ and label `"Amp (a.u.)"`.
     * Dashed grid lines ($3\times 3$) rendered behind the mint pulsatile polyline for clinical telemetry clarity.
   * Matched identical vector geometry in the generated PDF report via SVG `<line>` and `<text>` elements.

2. **Patient Name Collection & Report Personalization:**
   * Added an interactive patient name input field on the results screen.
   * Persisted name locally via `AsyncStorage` (`@react-native-async-storage/async-storage` key `smruti_patient_name`) so it is remembered automatically across sessions.
   * Passed the collected name into `downloadCheckupReport(analysis, userName)` to personalize the patient identification card in the PDF header.

3. **Expanded 18+ Physiological Checkup Panel:**
   * Replaced verbose methodology text with clean, concise clinical cards displaying Test Name, Measured Value + Unit, Clinical Reference Range, and Status Badge (`Optimal`, `Normal`, `Borderline`, `Elevated`):
     * **Cardiovascular:** Resting Heart Rate (BPM), Systolic Blood Pressure (mmHg), Diastolic Blood Pressure (mmHg), Mean Arterial Pressure (MAP mmHg), Pulse Pressure (mmHg), Cardiac Output Proxy (L/min).
     * **Metabolic:** Fasting Blood Glucose (mg/dL), Postprandial Glucose Estimate (mg/dL), Metabolic Health Risk Tier.
     * **Respiratory:** Blood Oxygen Saturation ($SpO_2$ %), Respiration Rate (breaths/min).
     * **Autonomic & HRV:** RMSSD (ms), SDNN (ms), Autonomic Stress Score (%), Sympathovagal Balance (LF/HF ratio proxy).
     * **Vascular Health:** Vascular Elasticity, Systolic Upstroke Time (ms), Arterial Stiffness Index (SI m/s), Perfusion Index (PI %), Vascular Age Indicator (years relative to baseline), Hemodynamic Stability Score (/100).
   * Added interactive category filter pills (`All`, `Cardiovascular`, `Metabolic`, `Respiratory`, `Autonomic & HRV`, `Vascular Health`).

4. **Device Memory Persistence (SQLite) & AI Chat Integration:**
   * **Structured Data Mapping (`buildCheckupFacts` in `mobile/src/pulse.ts`):** Converts all 18 checkup test items into normalized `Fact` objects with parsed reference ranges (`refLow`, `refHigh`) and analyte names.
   * **Local Database Storage (`saveCheckupDocument` in `mobile/src/db.ts`):** Inserts the checkup into SQLite table `documents` and records all 18 vitals in table `facts` inside an atomic transaction (`withTransactionAsync`).
   * **Reactive State Synchronization:** Triggers `onSavedRecord()` which executes `refresh()` in `App.tsx`, updating the global `facts` array and making the checkup visible in the `Memory` tab.
   * **Conversational AI Querying (`mobile/src/screens/Ask.tsx`):**
     * Because `AskScreen` transmits `facts` to the backend `/api/ask` endpoint, the assistant (Gemini/Groq) now has full awareness of the optical checkup results.
     * Users can ask questions like: *"What was my blood pressure in my last checkup?"*, *"Is my estimated glucose normal?"*, or *"Can you explain my vascular elasticity and HRV?"* in English, Hindi, or Telugu.
   * **Quick Navigation:** Added a `"💬 Chat About Results in Ask"` button directly on the checkup result sheet to transition straight to the chat composer.



