# On-Device Chinese Face Diagnosis (TCM): System & Scientific Architecture

This document details the architecture, mathematics, and scientific backing for the purely on-device Traditional Chinese Medicine (TCM) Face Diagnosis engine integrated into the application.

## 1. System Architecture & The Optical Extraction Process

The system bypasses external AI models entirely, favoring a secure, zero-latency, on-device optical extraction pipeline designed to function without an internet connection.

### 1.1. Optical Capture
1. **Camera Interfacing:** The application requests front-facing camera access and captures a **JPEG-compressed** frame of the user's face at a fixed 1280x720 capture size (`quality: 0.6`). The frame is deliberately small: the native rotate/mirror pass decodes the full bitmap into memory, and a full-resolution front-camera frame can exhaust it.
2. **Buffer Decoding:** The image is natively converted to a base64 string, passed into the JavaScript thread, decoded to bytes by `base64ToBytes()` (`src/base64.ts`), and then decoded by `jpeg-js`. This yields a flat `Uint8Array` in **RGBA** order -- four bytes per pixel, which is why the sampler advances with a stride of 4.
3. **Subsampled Iteration:** To keep the work off the UI thread's critical path, the sampler visits every 4th pixel in both axes (~1/16 of the pixels in a zone). This is an *estimate* of each zone's mean colour, not an exact one; for large flat regions of skin the sampling error is small relative to the thresholds applied, but it is a statistical approximation and not a lossless summary.

### 1.2. Spatial Anatomical Mapping
Because the application does not include a facial-landmark model, it uses one deterministic **Spatial Bounding Box Heuristic**. All coordinates are fractions of the captured image and live in the centralized `FACE_ZONES` configuration at `mobile/src/faceDiagnosis.ts:20-85`. The same coordinates are used on every run; there are no random region selections or generated measurements.

| Report zone | Traditional association shown in the report | Normalized bounds $(x_{min},x_{max},y_{min},y_{max})$ | Source lines |
|---|---|---|---|
| Forehead | Heart / Small Intestine | $(0.30,0.70,0.10,0.30)$ | `faceDiagnosis.ts:21-25` |
| Temples | Gallbladder; some maps use Liver | left $(0.12,0.28,0.18,0.38)$, right $(0.72,0.88,0.18,0.38)$ | `faceDiagnosis.ts:26-30` |
| Between eyebrows | Liver; some maps use Lung | $(0.43,0.57,0.27,0.40)$ | `faceDiagnosis.ts:31-35` |
| Under-eyes | Kidneys | left $(0.24,0.44,0.36,0.49)$, right $(0.56,0.76,0.36,0.49)$ | `faceDiagnosis.ts:36-40` |
| Nose bridge | Liver | $(0.44,0.56,0.34,0.50)$ | `faceDiagnosis.ts:41-45` |
| Nose tip | Spleen | $(0.42,0.58,0.49,0.62)$ | `faceDiagnosis.ts:46-50` |
| Nose sides / nasal grooves | Stomach, Lung / Large Intestine | $(0.35,0.65,0.48,0.64)$ | `faceDiagnosis.ts:51-55` |
| Upper cheeks | Stomach | left $(0.20,0.40,0.40,0.54)$, right $(0.60,0.80,0.40,0.54)$ | `faceDiagnosis.ts:56-60` |
| Middle/lower cheeks | Lungs | left $(0.18,0.40,0.52,0.68)$, right $(0.60,0.82,0.52,0.68)$ | `faceDiagnosis.ts:61-65` |
| Lips and mouth | Spleen; some maps split upper/lower lip | $(0.35,0.65,0.62,0.76)$ | `faceDiagnosis.ts:66-70` |
| Chin | Kidneys / Bladder | $(0.35,0.65,0.74,0.92)$ | `faceDiagnosis.ts:71-75` |
| Overall face reference | Overall complexion | $(0.20,0.80,0.10,0.90)$ | `faceDiagnosis.ts:76-80` |

---

## 2. Mathematical Formulas & Algorithmic Formulations

The diagnosis relies on extracting the dominant chromaticity and luminance of each spatial zone and applying discrete mathematical thresholds.

### 2.1. Pixel Coordinates and Deterministic Sampling

For image width $W$, image height $H$, and normalized bounds $(x_{min},x_{max},y_{min},y_{max})$, integer pixel limits are:

$$X_0=\lfloor W x_{min}\rfloor,\quad X_1=\lfloor W x_{max}\rfloor,\quad Y_0=\lfloor H y_{min}\rfloor,\quad Y_1=\lfloor H y_{max}\rfloor$$

The sampler uses the fixed configured step $d=4$ pixels in both axes:

$$\mathcal{P}=\{(x,y)\mid x=X_0+kd<X_1,\ y=Y_0+md<Y_1,\ k,m\in\mathbb{Z}_{\ge 0}\}$$

This is implemented at `faceDiagnosis.ts:263-285`; the sampling step is declared once at `faceDiagnosis.ts:101`.

### 2.2. Regional Mean Chromaticity

For the sampled pixel set $\mathcal{P}$, with $N=|\mathcal{P}|$, the regional channel means are:

$$ \bar{R}_{zone} = \frac{1}{N} \sum_{i=1}^{N} R_i, \quad \bar{G}_{zone} = \frac{1}{N} \sum_{i=1}^{N} G_i, \quad \bar{B}_{zone} = \frac{1}{N} \sum_{i=1}^{N} B_i $$

Where $N$ is the total number of sampled pixels in the bounding box.

For a bilateral zone with $K$ component rectangles (for example, two cheeks), the implementation averages the component colors:

$$\bar{C}_{bilateral}=\frac{1}{K}\sum_{j=1}^{K}\bar{C}_j,\qquad C\in\{R,G,B\}$$

The regional means are computed at `faceDiagnosis.ts:263-285`; bilateral aggregation is at `faceDiagnosis.ts:255-260`.

### 2.3. HSL Transformation

The regional RGB averages are transformed into HSL. The implementation is at `faceDiagnosis.ts:288-305`.

1.  Normalize RGB values to $[0, 1]$: $R', G', B'$
2.  Calculate minimum and maximum values: $C_{max} = \max(R', G', B')$, $C_{min} = \min(R', G', B')$
3. **Lightness**:
    $$ L = \frac{C_{max} + C_{min}}{2} $$
4. With $\Delta=C_{max}-C_{min}$, **saturation** is:
   $$S=\begin{cases}
   0,&\Delta=0\\
   \dfrac{\Delta}{C_{max}+C_{min}},&L\le 0.5\\
   \dfrac{\Delta}{2-C_{max}-C_{min}},&L>0.5
   \end{cases}$$
5. Hue is selected by the maximum channel and normalized to $[0,1]$:
   $$H=\frac{1}{6}\begin{cases}
   \dfrac{G'-B'}{\Delta}+6\,[G'<B'],&C_{max}=R'\\
   \dfrac{B'-R'}{\Delta}+2,&C_{max}=G'\\
   \dfrac{R'-G'}{\Delta}+4,&C_{max}=B'
   \end{cases}$$

### 2.4. Centralized Heuristic Thresholds

All thresholds are declared once in `COLOR_THRESHOLDS` at `faceDiagnosis.ts:89-102` and reused by both the report descriptions and pattern flags. They are deterministic configuration values, not random values and not fabricated per report. They are also heuristics rather than clinically trained parameters.

| Traditional report flag | Exact implemented condition | Source lines |
|---|---|---|
| Heart Fire | $\bar R_{forehead}>1.3\bar G_{forehead}$ | `faceDiagnosis.ts:197-199` |
| Stomach Heat | $\bar R_{noseTip}>1.3\bar G_{noseTip}$ | `faceDiagnosis.ts:200-202` |
| Liver Fire / Lung Heat | $\bar R_{lowerCheeks}>1.3\bar G_{lowerCheeks}$ | `faceDiagnosis.ts:203-205` |
| Kidney depletion | $L_{underEyes}<0.8L_{overall}$ | `faceDiagnosis.ts:206-208` |
| Kidney Deficiency | $L_{chin}<0.8L_{overall}$ | `faceDiagnosis.ts:209-211` |
| Spleen Qi Deficiency | $\bar G_{overall}>1.4\bar B_{overall}\ \land\ \bar R_{overall}<1.2\bar G_{overall}$ | `faceDiagnosis.ts:212-216` |
| Blood Deficiency | $L_{overall}>0.75\ \land\ \bar R_{overall}<1.1\bar G_{overall}$ | `faceDiagnosis.ts:217-219` |

The descriptive report also uses the consistent comparisons $L_{zone}<0.8L_{overall}$ (darker), $L_{zone}>1.2L_{overall}$ (brighter), and $S<0.12$ (low saturation) at `faceDiagnosis.ts:223-246`. Capture-light suitability uses $0.18\le L_{overall}\le0.92$ at `faceDiagnosis.ts:249-252`.

### 2.5. Report Generation and Reproducibility

The complete report is assembled at `faceDiagnosis.ts:127-169`. It always contains Method, Capture Summary, Traditional Zone Review, Traditional Pattern Flags, features not assessed, and an important limitation. Given identical decoded pixels and the same language, it returns identical text; no random-number generator, timestamp, server response, or model output participates in the calculation.

---

## 3. Scientific Validation & Direct Research Paper Citations

> **Verification note (2026-09-16).** The three citations previously listed in this
> section could not be located in any index (PubMed, IEEE Xplore, ScienceDirect,
> Google Scholar). They are not reproduced here. The specific claim that these
> thresholds are "directly corroborated" by published work was **not** supported by
> any source that could be found. This section now states only what can be checked.

### 3.1 What this implementation actually is

The engine is a **deterministic heuristic colour-ratio classifier**, not a validated
diagnostic instrument. The thresholds in Section 2 are named once in the centralized
configuration and applied consistently; no values are randomized or invented during
report generation. They were not fitted to a labelled clinical dataset and do not
have measured sensitivity or specificity. The output should be read as a description
of the colour content of an image, phrased in traditional TCM vocabulary.

Known limitations, stated plainly:

* **No face detection.** Zones are fixed rectangles assuming a centred, upright,
  front-facing portrait. An off-centre or tilted face silently samples the wrong regions.
* **No colour constancy.** Ambient light temperature, white balance and camera
  ISP tone-mapping move the R/G/B ratios far more than physiology does. Without a
  reference white or a calibration card, thresholds like `R > 1.3G` are not
  comparable between two photos, let alone two people.
* **No skin-tone normalisation.** Fixed absolute ratios interact strongly with
  baseline melanin, so the same threshold does not mean the same thing across skin tones.
* **Limited observable features.** Mean RGB/HSL cannot reliably measure acne type,
  puffiness, hydration, texture, broken capillaries, wrinkles, eye vitality, hair,
  pulse, tongue, symptoms or medical history, so the report explicitly says these
  were not assessed.
* **Not a medical device.** No claim of diagnostic accuracy is made or implied.

### 3.2 Traditional mapping references used for the expanded report

The application paraphrases and reconciles the face-zone concepts in these requested
references; it does not reproduce their prose:

1. [Meraki Holistic Health — Facial Diagnosis](https://www.merakiholistichealth.com/post/facial-diagnosis): overall colouring and the observation categories of puffiness, hydration, skin texture and acne. Only colour is computed; the remaining categories appear under "Not assessed."
2. [wikiHow — Chinese Face Mapping](https://www.wikihow.com/Chinese-Face-Mapping): forehead, temples/between-brows, under-eyes, cheeks/lips, nasal grooves and chin mappings, plus its explicit warning that Chinese face mapping lacks sufficient scientific evidence and should not replace a dermatologist or doctor.
3. [Dr Attilio D'Alberto — Face Diagnosis in Chinese Medicine](https://www.attiliodalberto.com/traditional-chinese-medicine/face-diagnosis.php): the detailed forehead, brow, eye, nose, cheek, mouth, chin and temple zone map and the caution that face observations should not stand alone.

The sources disagree on several associations. The app reports those disagreements
instead of silently choosing one: temples are shown as Gallbladder / Liver,
between-brows as Liver / Lung, and nose sides as Stomach, Lung / Large Intestine.

### 3.3 Genuine related literature

Computerised TCM facial-complexion analysis *is* a real research area, and the
following paper was verified to exist. It is offered as **background on the field**,
not as validation of this implementation:

> Zhao, C., Li, G.-Z., Li, F., Wang, Z., & Liu, C. (2014).
> "Qualitative and Quantitative Analysis for Facial Complexion in Traditional Chinese Medicine."
> *BioMed Research International*, 2014, Article ID 207589.
> DOI: [10.1155/2014/207589](https://doi.org/10.1155/2014/207589)

**What it actually supports:** it partitions the face into five regions -- forehead,
nose, left cheek, right cheek and jaw -- which is broadly the partitioning scheme used
in Section 1.2.

**Where it differs from this implementation:** the authors work in **CIELAB**, chosen
explicitly because it separates luminance (`L*`) from chromaticity (`a*`, `b*`). This
implementation uses raw RGB ratios plus an HSL lightness term. The paper does not
license the specific numeric thresholds used here, and it is not evidence that an
RGB-ratio rule reproduces a clinical TCM assessment.

A defensible next step, if this feature is to be taken further, would be to move the
colour maths into CIELAB and to calibrate against a reference white in-frame.
