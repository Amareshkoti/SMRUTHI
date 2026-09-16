# REFLECTIVE OPTICAL PHOTOPLETHYSMOGRAPHY (cPPG)
## Mathematical Formulas, Signal Processing Pipeline & Peer-Reviewed Scientific Validation

**Project:** SMRUTI Vitality Health Checkup Suite | **Sensing Modality:** Camera-based Reflective PPG (cPPG) | **Release:** Technical & Scientific Analysis Report
**Scope:** Mathematical inventory of all algorithmic formulas, source files, physiological foundations, and direct literature citations.

---

### 1. System Architecture & The Optical Extraction Process

**Hardware Isolation & The Sensor Transition:** Modern smartphone fingerprint sensors operate exclusively within a hardware-isolated Trusted Execution Environment (TEE). Third-party user-space applications are cryptographically prohibited from accessing raw capacitance matrices or optical sensor frames. To deliver non-invasive health screening on commodity smartphones, this system transitions to Reflective Optical Photoplethysmography (cPPG) using the rear CMOS camera sensor combined with the adjacent continuous LED flash.

| Stage | Module / File | Engineering Operation | Physiological / Signal Objective |
| :--- | :--- | :--- | :--- |
| **1. Optical Capture** | PulseSheet.tsx CameraView | Captures camera frames at 10-15 FPS with flash enabled, skipProcessing=true. | Transilluminates capillary beds of fingertip dermis; captures time-series optical backscatter. |
| **2. Tissue Verification** | pulse.ts frameBrightness() | Subsamples frame red and green channels. Enforces avgRed >= 95 and avgRed >= 1.15 * avgGreen. | Prevents mathematical aliasing from ambient AC lighting. |
| **3. Temporal Resampling** | pulse.ts resample() | Linear interpolation of timestamped luminance samples onto a uniform 20 Hz temporal grid. | Eliminates capture jitter, fulfilling the strict equidistant time requirement for digital filtering. |
| **4. Outlier Clamping** | pulse.ts clampMotionSpikes() | Derivative thresholding: clamps step changes exceeding 3.5x the median absolute first difference. | Suppresses mechanical motion artifacts caused by transient finger slip. |
| **5. Bandpass Filter** | pulse.ts applyBandpass() | Zero-mean centering + 2nd-order Butterworth cascaded highpass (0.7 Hz) and lowpass (3.5 Hz). | Isolates cardiac pulsatile frequencies; rejects DC respiratory baseline wander and noise. |
| **6. Optical Inversion** | pulse.ts analyzeSignalWindow()| Signal polarity inversion: s[n] = -filtered[n]. | Beer-Lambert Law alignment: systolic capillary blood expansion absorbs more light; inversion makes pulses positive peaks. |
| **7. Peak & Beat Detection** | pulse.ts analyzeSignalWindow()| Local maxima search with refractory distance constraint (>= 0.35s) and adaptive prominence. | Extracts true systolic peaks while preventing double-counting of dicrotic notches. |
| **8. Interval Filtering** | pulse.ts analyzeSignalWindow()| Derives RR intervals; rejects intervals with instantaneous BPM outside [40, 200]. | Guarantees high-fidelity Inter-Beat Interval (IBI) series for downstream autonomic HRV computation. |

---

### 2. Mathematical Formulas & Algorithmic Formulations

Every formula used across the mobile application and the research testbench is itemised
below with exact parameter definitions. Sampling rate is $f_s = 20\ \mathrm{Hz}$ after
resampling; $N$ denotes a sample count and $M$ the number of usable RR intervals.

#### 2.1 Optical Tissue Verification & Subsampled Luminance

The decoded frame is an RGBA buffer, so channel $c$ of pixel $k$ lies at byte $4k + c$.
With a subsample factor $s$:

$$
\bar{I}_{\text{red}} \;=\; \frac{1}{N}\sum_{k=0}^{N-1} I\!\left[4sk\right],
\qquad
\bar{I}_{\text{green}} \;=\; \frac{1}{N}\sum_{k=0}^{N-1} I\!\left[4sk+1\right]
$$

A frame is accepted as fingertip tissue only when both conditions hold:

$$
\textsf{valid} \iff \left(\bar{I}_{\text{red}} \ge 95\right) \;\wedge\;
\left(\bar{I}_{\text{red}} \ge 1.15\,\bar{I}_{\text{green}}\right)
$$

#### 2.2 Uniform Temporal Resampling (Linear Interpolation)

For a target instant $t_k$ bracketed by acquired samples $t_i \le t_k < t_{i+1}$:

$$
y(t_k) \;=\; y(t_i) \;+\; \bigl[\,y(t_{i+1}) - y(t_i)\,\bigr]\cdot
\frac{t_k - t_i}{t_{i+1} - t_i}
$$

#### 2.3 Derivative-Based Outlier Clamping (Motion Artefact Reduction)

$$
\Delta x[i] \;=\; \bigl|\,x[i] - x[i-1]\,\bigr|,
\qquad
T \;=\; \max\!\Bigl(3.0,\; 3.5 \cdot \operatorname{median}_i\bigl(\Delta x[i]\bigr)\Bigr)
$$

$$
x^{*}[i] \;=\;
\begin{cases}
x^{*}[i-1] + \operatorname{sgn}\!\bigl(x[i] - x^{*}[i-1]\bigr)\cdot T,
  & \bigl|x[i] - x^{*}[i-1]\bigr| > T \[6pt]
x[i], & \text{otherwise}
\end{cases}
$$

#### 2.4 Second-Order Butterworth Bandpass IIR Filter (Biquad Formulation)

With cutoff $f_c$, damping $d = \sqrt{2}$, and passband $0.7\text{--}3.5\ \mathrm{Hz}$:

$$
\theta \;=\; \frac{\pi f_c}{f_s},
\qquad
\beta \;=\; \frac{1}{2}\cdot
\frac{1 - \frac{d}{2}\sin\theta}{1 + \frac{d}{2}\sin\theta},
\qquad
\gamma \;=\; \left(\tfrac{1}{2} + \beta\right)\cos\theta
$$

The cascaded sections are applied through the standard difference equation:

$$
y[n] \;=\; b_0\,x[n] + b_1\,x[n-1] + b_2\,x[n-2]
\;-\; a_1\,y[n-1] \;-\; a_2\,y[n-2]
$$

#### 2.5 Heart Rate (BPM) from Peak Intervals

For detected peak indices $p[k]$:

$$
RR[k] \;=\; \frac{p[k] - p[k-1]}{f_s}\ \ [\mathrm{s}],
\qquad
\mathrm{HR} \;=\; \operatorname{round}\!\left(
\frac{60}{\operatorname{median}\bigl(RR_{\text{clean}}\bigr)}\right)\ [\mathrm{bpm}]
$$

#### 2.6 Heart Rate Variability: RMSSD, SDNN, pNN50 & pNN20

$$
\mathrm{RMSSD} \;=\; 1000\sqrt{\frac{1}{M-1}
\sum_{k=1}^{M-1}\bigl(RR[k+1] - RR[k]\bigr)^{2}}\ \ [\mathrm{ms}]
$$

$$
\mathrm{SDNN} \;=\; 1000\sqrt{\frac{1}{M}
\sum_{k=1}^{M}\bigl(RR[k] - \overline{RR}\bigr)^{2}}\ \ [\mathrm{ms}]
$$

$$
\mathrm{pNN}x \;=\;
\frac{\bigl|\{\,k \;:\; |RR[k+1] - RR[k]| > x\ \mathrm{ms}\,\}\bigr|}{M-1}
\times 100\ \ [\%], \qquad x \in \{20,\,50\}
$$

#### 2.7 Autonomic Stress Score

$$
S \;=\; \operatorname{clamp}\!\Bigl(
15 + 1.8\cdot\max\bigl(0,\; 50 - \mathrm{RMSSD}\bigr),\;\; 10,\;\; 95
\Bigr)\ \ [\%]
$$

#### 2.8 Systolic Upstroke Time (Foot-to-Peak) & Vascular Elasticity

$$
j_{\text{foot}} \;=\; \operatorname*{arg\,min}_{\,j \,\in\, [\,p - \lfloor 0.4 f_s \rfloor,\; p\,]} s[j],
\qquad
T_{\text{up}} \;=\; \frac{p - j_{\text{foot}}}{f_s}\times 1000\ \ [\mathrm{ms}]
$$

$$
\text{Optimal elasticity: } T_{\text{up}} \ge 130\ \mathrm{ms}
\qquad
\text{Elevated stiffness: } T_{\text{up}} < 105\ \mathrm{ms}
$$

#### 2.9 Blood Oxygen Saturation (SpO$_2$ via Ratio of Ratios)

$$
R \;=\; \frac{AC_{\text{red}} / DC_{\text{red}}}{AC_{\text{green}} / DC_{\text{green}}},
\qquad
\mathrm{SpO_2} \;=\; \operatorname{round}\bigl(110 - 25R\bigr)\ \ [\%]
$$

#### 2.10 LF/HF Ratio (Frequency-Domain HRV Surrogate)

$$
\sigma^{2}_{LF} \;=\; \max\!\bigl(0,\; \mathrm{SDNN}^{2} - \mathrm{RMSSD}^{2}\bigr),
\qquad
\sigma^{2}_{HF} \;=\; \mathrm{RMSSD}^{2}
$$

$$
\frac{LF}{HF} \;=\; \frac{\sigma^{2}_{LF}}{\sigma^{2}_{HF}}
$$

#### 2.11 Stroke Volume, Cardiac Output & Cardiac Workload

$$
PP \;=\; BP_{\text{sys}} - BP_{\text{dia}}\ \ [\mathrm{mmHg}],
\qquad
SV \;=\; \operatorname{round}\bigl(1.5\cdot PP\bigr)\ \ [\mathrm{mL}]
$$

$$
CO \;=\; \frac{SV \cdot \mathrm{HR}}{1000}\ \ [\mathrm{L/min}],
\qquad
RPP \;=\; \mathrm{HR}\cdot BP_{\text{sys}}\ \ [\mathrm{mmHg\cdot bpm}]
$$

---

### 3. Scientific Validation & Direct Research Paper Citations

The mathematical principles, optical filter thresholds, and physiological interpretations implemented in the codebase are grounded in and validated by peer-reviewed biomedical engineering literature:

| Biomarker / Formula | Physiological Grounding | Primary Literature Citation |
| :--- | :--- | :--- |
| **Photoplethysmography & Beer-Lambert Law** | Volumetric expansion of arteriolar vessels during ventricular systole increases light absorption by oxy- and deoxyhemoglobin. | **Allen, J. (2007).** *Physiological Measurement*, 28(3), R1-R39. |
| **Smartphone Camera PPG (cPPG)** | CMOS image sensors capture micro-fluctuations in reflected red/green luminance caused by pulsatile dermal perfusion. | **Scully, C. G., et al. (2012).** *IEEE TBME*, 59(2), 303-306. |
| **Butterworth Bandpass (0.7-3.5 Hz)** | Isolates cardiac fundamental and harmonic frequencies (42-210 BPM) while stripping respiratory drift (<0.5 Hz) and sensor noise. | **Elgendi, M. (2012).** *Current Cardiology Reviews*, 8(1), 14-25. |
| **Time-Domain HRV (RMSSD, SDNN, pNN50, pNN20)** | RMSSD and pNN20/50 index high-frequency parasympathetic (vagal) cardiac control. SDNN indexes total autonomic regulatory capacity. | **Task Force of ESC & NASPE (1996).** *Circulation*, 93(5), 1043-1065. <br><br>**Shaffer, F. et al. (2017).** *Frontiers in Public Health*, 5, 258. |
| **LF/HF Ratio** | Quantifies the sympathovagal balance, acting as a clinical surrogate for physical and mental stress states. | **Malliani, A., et al. (1991).** *Circulation*, 84(2), 482-492. |
| **Blood Oxygen Saturation (SpO2)** | The ratio of pulsatile to baseline light absorption (AC/DC) across Red and Green wavelengths isolates oxygenated hemoglobin saturation. | **Karlen, W., et al. (2010).** *Conference of the IEEE Engineering in Medicine and Biology*. |
| **Systolic Upstroke Time (T_up) & Elasticity** | Moens-Korteweg Law. Vessel stiffening increases pulse wave velocity (PWV), accelerating the systolic upstroke (T_up < 105 ms). | **Chowienczyk, P. J., et al. (1999).** *JACC*, 34(7), 2007-2014. |
| **Stroke Volume (SV) & Cardiac Output (CO)** | Pulse contour analysis models (e.g., Liljestrand-Zander) establish that arterial pulse pressure is proportionally related to stroke volume. | **Wang, L., et al. (2018).** *Sensors*, 18(1), 173. |
| **Respiration Rate via RSA** | Respiratory Sinus Arrhythmia: Intrathoracic pressure changes during respiration modulate venous return and autonomic vascular tone. | **Karlen, W., et al. (2013).** *IEEE TBME*, 60(7), 1946-1953. |
| **Cuff-Anchored Calibrated BP** | Optical cPPG cannot derive absolute hydrostatic pressure without a reference anchor. Perturbation models track changes relative to known readings. | **Mukkamala, R., et al. (2015).** *IEEE TBME*, 62(8), 1879-1901. |

---

### 4. Regulatory Boundaries & Software as a Medical Device (SaMD) Notice

**Clinical Boundary & Non-Diagnostic Scope:** The optical photoplethysmography pipeline documented herein operates exclusively as a **personal wellness and non-invasive physiological screening tool**. It does not measure blood glucose or invasive arterial hemodynamics directly. In accordance with FDA / CE SaMD guidance:
1. **Metabolic Surrogates:** Advanced Glycation End-products (AGEs) alter arterial wall stiffness and autonomic vagal tone over time, but PPG cannot replace chemical glucose testing. Patients must **never** adjust insulin or hypoglycemic medication based on optical estimations.
2. **Blood Pressure Grounding:** Blood pressure estimates are one-point cuff-anchored perturbation models, not direct hydrostatic measurements, and require regular recalibration.
3. **Diagnostic Authority:** Users experiencing symptoms or seeking clinical diagnoses must consult a licensed physician and undergo standardized laboratory blood tests.
