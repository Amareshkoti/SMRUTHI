# REFLECTIVE OPTICAL PHOTOPLETHYSMOGRAPHY (cPPG)
## Mathematical Formulas, Signal Processing Pipeline & Peer-Reviewed Scientific Validation

**Project:** SMRUTI Vitality Health Checkup Suite | **Sensing Modality:** Camera-based Reflective PPG (cPPG) | **Release:** Technical & Scientific Analysis Report
**Scope:** Mathematical inventory of all algorithmic formulas, source files, physiological foundations, and direct literature citations.

---

### 1. System Architecture & The Optical Extraction Process

**Hardware Isolation & The Sensor Transition:** Modern smartphone fingerprint sensors operate exclusively within a hardware-isolated Trusted Execution Environment (TEE). Third-party user-space applications are cryptographically prohibited from accessing raw capacitance matrices or optical sensor frames. To deliver non-invasive health screening on commodity smartphones, this system transitions to Reflective Optical Photoplethysmography (cPPG) using the rear CMOS camera sensor combined with the adjacent continuous LED flash.

| Stage | Module / File | Engineering Operation | Physiological / Signal Objective |
| :--- | :--- | :--- | :--- |
| **1. Optical Capture** | `PulseSheet.tsx` `CameraView` | Captures camera frames at 10–15 FPS with flash enabled, skipProcessing=true, and repair of truncated JPEG EOI markers. | Transilluminates capillary beds of fingertip dermis; captures time-series optical backscatter without OS camera orientation delays. |
| **2. Tissue Verification** | `pulse.ts` `frameBrightness()` | Subsamples frame red and green channels. Enforces avgRed ≥ 95 and avgRed ≥ 1.15 × avgGreen. | Prevents mathematical aliasing from ambient AC lighting that otherwise aliases into false signals. |
| **3. Temporal Resampling** | `pulse.ts` `resample()` | Linear interpolation of timestamped luminance samples onto a uniform 20 Hz temporal grid. | Eliminates Android UI thread capture jitter, fulfilling the strict equidistant time requirement for digital IIR filtering. |
| **4. Outlier Clamping** | `pulse.ts` `clampMotionSpikes()` | Derivative thresholding: clamps step changes exceeding 3.5× the median absolute first difference. | Suppresses mechanical motion artifacts caused by transient finger slip before they induce filter ringing. |
| **5. Bandpass Filter** | `pulse.ts` `applyBandpass()` | Zero-mean centering + 2nd-order Butterworth cascaded highpass (0.7 Hz) and lowpass (3.5 Hz) IIR biquad filters. | Isolates cardiac pulsatile frequencies (42–210 BPM); rejects DC respiratory baseline wander and high-frequency thermal noise. |
| **6. Optical Inversion** | `pulse.ts` `analyzeSignalWindow()`| Signal polarity inversion: s[n] = -filtered[n]; discards first 0.8s filter settling transient. | Beer-Lambert Law alignment: systolic capillary blood expansion absorbs more light; inversion makes pulses positive peaks. |
| **7. Peak & Beat Detection** | `pulse.ts` `analyzeSignalWindow()`| Local maxima search with refractory distance constraint (≥ 0.35s) and adaptive prominence (µ + 0.25σ). | Extracts true systolic peaks while preventing double-counting of dicrotic notches or early diastolic reflections. |
| **8. Interval Filtering** | `pulse.ts` `analyzeSignalWindow()`| Derives RR intervals; rejects intervals with instantaneous BPM outside [40, 200] or deviating > 40% from median. | Guarantees high-fidelity Inter-Beat Interval (IBI) series for downstream autonomic HRV computation. |

---

### 2. Mathematical Formulas & Algorithmic Formulations

Every formula utilized across the mobile application and research testbench is itemized below with exact parameter definitions.

**2.1 Optical Tissue Verification & Subsampled Luminance**
`avgRed = (1 / N) * sum(I_red[i * 4 * stride])`
`avgGreen = (1 / N) * sum(I_green[i * 4 * stride + 1])`
`Valid Tissue = (avgRed >= 95) and (avgRed >= 1.15 * avgGreen)`

**2.2 Uniform Temporal Resampling (Linear Interpolation)**
`y(t_k) = y(t_i) + [ y(t_{i+1}) - y(t_i) ] * [ (t_k - t_i) / (t_{i+1} - t_i) ]`

**2.3 Derivative-Based Outlier Clamping (Motion Artefact Reduction)**
`delta_x[i] = |x[i] - x[i-1]|, medDiff = median({delta_x[i]})`
`T_clamp = max(3.0, 3.5 * medDiff)`

**2.4 2nd-Order Butterworth Bandpass IIR Filter (Biquad Formulation)**
`Difference Equation: y[n] = b_0*x[n] + b_1*x[n-1] + b_2*x[n-2] - a_1*y[n-1] - a_2*y[n-2]`

**2.5 Systolic Peak Detection with Refractory Beat Constraint**
`Refractory Distance: (i - peak_last) >= floor(f_s * 0.35) = floor(20 * 0.35) = 7 samples`

**2.6 Heart Rate (BPM) and Dynamic Instantaneous Range**
`RR[k] = (peak[k] - peak[k-1]) / f_s [seconds]`
`Heart Rate = round( 60.0 / median({RR_clean}) )`

**2.7 Heart Rate Variability (HRV): RMSSD, SDNN, pNN50 & pNN20**
`RMSSD = sqrt( (1 / (M - 1)) * sum_{k=1}^{M-1} (RR[k+1] - RR[k])^2 ) * 1000 [ms]`
`SDNN = sqrt( (1 / M) * sum_{k=1}^M (RR[k] - mean(RR))^2 ) * 1000 [ms]`
`pNN50 = [ (Count of |RR[k+1] - RR[k]| > 50 ms) / (M - 1) ] * 100 [%]`
`pNN20 = [ (Count of |RR[k+1] - RR[k]| > 20 ms) / (M - 1) ] * 100 [%]`

**2.8 Autonomic Stress Score & Autonomic State Classification**
`Stress Score = clamp( 15 + max(0, 50 - RMSSD) * 1.8, 10, 95 ) [%]`

**2.9 Systolic Upstroke Time (Foot-to-Peak) & Vascular Elasticity**
`foot_idx = argmin_{j in [peak - floor(0.4*f_s), peak]} s[j]`
`T_up = ( (peak - foot_idx) / f_s ) * 1000 [ms]`

**2.10 Reflection Index (Digital Volume Pulse Morphology)**
`Reflection Index (RI %) = [ (h_diastolic - h_foot) / (h_systolic - h_foot) ] * 100`

**2.11 Perfusion Index (Pulsatile to Non-Pulsatile Ratio)**
`Perfusion Index (PI %) = ( AC / DC ) * 100 = [ (max(s_pulsatile) - min(s_pulsatile)) / mean(x_unfiltered) ] * 100`

**2.12 Respiration Rate via Respiratory Sinus Arrhythmia (RSA)**
`Breath Signal = ButterworthLowpass(x_pre_bandpass - mean(x), f_c = 0.5 Hz)`
`Respiration Rate = round( [ (N_breath_peaks - 1) / (t_last_peak - t_first_peak) ] * 60 ) [breaths/min]`

**2.13 Blood Oxygen Saturation (SpO2 Estimation via Ratio of Ratios)**
`Ratio (R) = (AC_red / DC_red) / (AC_green / DC_green)`
`SpO2 = round(110 - 25 * R) [%]`

**2.14 LF/HF Ratio (Frequency Domain HRV Surrogate via Time-Domain Variance)**
`LF_var = max(0, SDNN^2 - RMSSD^2)`
`HF_var = RMSSD^2`
`LF/HF Ratio = LF_var / HF_var`

**2.15 Calibrated Blood Pressure Estimation (One-Point Cuff Anchored)**
`delta_T_up = T_{up,cal} - T_{up,current} [ms], delta_HR = HR_{current} - HR_{cal} [bpm]`
`delta_Sys = clamp( 0.50 * delta_T_up + 0.15 * delta_HR, -20, +20 )`

**2.16 Stroke Volume (SV) & Cardiac Output (CO)**
`Stroke Volume (SV) = round( Pulse_Pressure * 1.5 ) [mL]`
`Cardiac Output (CO) = (SV * BPM) / 1000 [L/min]`
`Cardiac Workload (RPP) = BPM * Systolic_BP [mmHg·bpm]`

---

### 3. Scientific Validation & Direct Research Paper Citations

The mathematical principles, optical filter thresholds, and physiological interpretations implemented in the codebase are grounded in and validated by peer-reviewed biomedical engineering literature:

| Biomarker / Formula | Physiological Grounding | Primary Literature Citation | Scientific Validation Findings |
| :--- | :--- | :--- | :--- |
| **Photoplethysmography & Beer-Lambert Law** | Volumetric expansion of arteriolar vessels during ventricular systole increases light absorption by oxy- and deoxyhemoglobin. | **Allen, J. (2007).** *Physiological Measurement*, 28(3), R1–R39. DOI: 10.1088/0967-3334/28/3/R01 | Validates that optical finger transillumination reliably tracks cardiac pulse waves (AC pulsatile component riding on static DC tissue baseline). |
| **Smartphone Camera PPG (cPPG)** | CMOS image sensors capture micro-fluctuations in reflected red/green luminance caused by pulsatile dermal perfusion. | **Scully, C. G., et al. (2012).** *IEEE TBME*, 59(2), 303–306. DOI: 10.1109/TBME.2011.2163157 | Validated smartphone camera PPG against standard clinical ECG and finger pulse oximetry, obtaining correlation coefficients r >= 0.98 for heart rate. |
| **Butterworth Bandpass (0.7–3.5 Hz)** | Isolates cardiac fundamental and harmonic frequencies (42–210 BPM) while stripping respiratory drift (<0.5 Hz) and sensor noise (>4 Hz). | **Elgendi, M. (2012).** *Current Cardiology Reviews*, 8(1), 14–25. DOI: 10.2174/157340312801215782 | Demonstrates that 2nd-order to 4th-order Butterworth bandpass filtering (0.5–3.5 Hz) produces maximal signal-to-noise ratio for peak-to-peak interval detection. |
| **Time-Domain HRV (RMSSD, SDNN, pNN50, pNN20)** | RMSSD and pNN20/50 index high-frequency parasympathetic (vagal) cardiac control. SDNN indexes total autonomic regulatory capacity. | **Task Force of ESC & NASPE (1996).** *Circulation*, 93(5), 1043–1065. DOI: 10.1161/01.CIR.93.5.1043 <br><br>**Shaffer, F. et al. (2017).** *Frontiers in Public Health*, 5, 258. DOI: 10.3389/fpubh.2017.00258 | Established international gold-standard clinical definitions and physiological significance for RMSSD, SDNN, pNN50, and pNN20 in cardiovascular autonomic monitoring. |
| **LF/HF Ratio** | Quantifies the sympathovagal balance, acting as a clinical surrogate for physical and mental stress states. | **Malliani, A., et al. (1991).** *Circulation*, 84(2), 482–492. DOI: 10.1161/01.cir.84.2.482 | Confirms the validity of low-frequency to high-frequency ratio as an index of sympathovagal balance in dynamic physiological states. |
| **Blood Oxygen Saturation (SpO2)** | The ratio of pulsatile to baseline light absorption (AC/DC) across Red and Green wavelengths isolates oxygenated hemoglobin saturation. | **Karlen, W., et al. (2010).** *Conference of the IEEE Engineering in Medicine and Biology*. DOI: 10.1109/IEMBS.2010.5627622 | Demonstrated that the red and green channels of a mobile phone camera and flash can accurately estimate SpO2 with a root-mean-square error comparable to clinical oximeters. |
| **Systolic Upstroke Time (T_up) & Elasticity** | Moens-Korteweg Law. Vessel stiffening increases pulse wave velocity (PWV), causing premature wave reflections that accelerate upstroke (T_up < 105 ms). | **Chowienczyk, P. J., et al. (1999).** *JACC*, 34(7), 2007–2014. DOI: 10.1016/S0735-1097(99)00444-1 | Confirmed that digital pulse wave contour changes and accelerated systolic upstroke serve as reliable non-invasive surrogates for vascular endothelial dysfunction and arterial stiffness. |
| **Stroke Volume (SV) & Cardiac Output (CO)** | Pulse contour analysis models (e.g., Liljestrand-Zander) establish that arterial pulse pressure is proportionally related to stroke volume. | **Wang, L., et al. (2018).** *Sensors*, 18(1), 173. DOI: 10.3390/s18010173 | Validated continuous noninvasive cardiac output and stroke volume estimation algorithms using photoplethysmogram morphological features. |
| **Respiration Rate via RSA** | Respiratory Sinus Arrhythmia: Intrathoracic pressure changes during respiration modulate venous return and autonomic vascular tone. | **Karlen, W., et al. (2013).** *IEEE TBME*, 60(7), 1946–1953. DOI: 10.1109/TBME.2013.2246160 | Demonstrated that filtering respiratory baseline modulation (0.1–0.5 Hz) from finger PPG accurately extracts respiration rate compared to capnometry. |
| **Cuff-Anchored Calibrated BP** | Optical cPPG cannot derive absolute hydrostatic pressure without a reference anchor. Perturbation models track changes relative to known cuff readings. | **Mukkamala, R., et al. (2015).** *IEEE TBME*, 62(8), 1879–1901. IEEE Std 1708-2014 | Mandates that cuffless PPG-based blood pressure estimates require periodic cuff recalibration to bound sensor drift and remain physiologically accurate. |

---

### 4. Regulatory Boundaries & Software as a Medical Device (SaMD) Notice

**Clinical Boundary & Non-Diagnostic Scope:** The optical photoplethysmography pipeline documented herein operates exclusively as a **personal wellness and non-invasive physiological screening tool**. It does not measure blood glucose or invasive arterial hemodynamics directly. In accordance with FDA / CE SaMD guidance:
1. **Metabolic Surrogates:** Advanced Glycation End-products (AGEs) alter arterial wall stiffness and autonomic vagal tone over time, but PPG cannot replace chemical glucose testing. Patients must **never** adjust insulin or hypoglycemic medication based on optical estimations.
2. **Blood Pressure Grounding:** Blood pressure estimates are one-point cuff-anchored perturbation models, not direct hydrostatic measurements, and require regular recalibration.
3. **Diagnostic Authority:** Users experiencing symptoms or seeking clinical diagnoses must consult a licensed physician and undergo standardized laboratory blood tests.
