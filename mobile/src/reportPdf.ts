import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { documentDirectory, cacheDirectory, writeAsStringAsync, copyAsync, EncodingType } from 'expo-file-system/legacy';
import type { PulseAnalysisResult } from './pulse';

/**
 * Generates and triggers the native download / sharing dialog for a comprehensive
 * Full Body Health Checkup PDF report.
 */
export async function downloadCheckupReport(result: PulseAnalysisResult, userName?: string): Promise<void> {
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const patientName = userName?.trim() || 'Self / Anonymous';

  // Generate SVG polyline path and axes for the waveform preview
  const points = result.waveformPoints ?? [];
  const svgWidth = 600;
  const svgHeight = 150;
  const plotLeft = 60;
  const plotRight = 580;
  const plotTop = 20;
  const plotBottom = 115;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  let polylinePoints = '';
  if (points.length > 0) {
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    polylinePoints = points
      .map((val, idx) => {
        const x = plotLeft + (idx / (points.length - 1)) * plotW;
        const norm = (val - min) / span;
        const y = plotBottom - norm * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  const items = result.testItems ?? [];

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SMRUTI Comprehensive Health Checkup Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 28px;
      color: #111827;
      background: #FFFFFF;
      font-size: 12px;
      line-height: 1.4;
    }
    .header {
      display: flex;
      justify-content: space-between;
      border-bottom: 2px solid #D8B26B;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .brand {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #0B0E11;
    }
    .brand span {
      color: #D8B26B;
    }
    .title {
      font-size: 16px;
      font-weight: 600;
      margin-top: 2px;
      color: #1F2937;
    }
    .patient-card {
      display: flex;
      justify-content: space-between;
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 18px;
      font-size: 12px;
    }
    .patient-col {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .waveform-card {
      border: 1px solid #E5E7EB;
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 20px;
      background: #0B0E11;
      color: #F3F4F6;
    }
    .waveform-header {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
      color: #9CA3AF;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .table th, .table td {
      border: 1px solid #E5E7EB;
      padding: 7px 10px;
      text-align: left;
    }
    .table th {
      background: #F3F4F6;
      font-weight: 600;
      color: #374151;
      font-size: 11px;
      text-transform: uppercase;
    }
    .category-row {
      background: #F8FAFC;
      font-weight: 700;
      color: #4B5563;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 9999px;
      font-size: 10px;
      font-weight: 600;
    }
    .badge-optimal { background: #DEF7EC; color: #03543F; }
    .badge-normal { background: #E0F2FE; color: #0369A1; }
    .badge-borderline { background: #FEF08A; color: #713F12; }
    .badge-elevated { background: #FDE8E8; color: #9B1C1C; }
    .disclaimer {
      border: 1px dashed #D1D5DB;
      background: #FFFBEB;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 10.5px;
      color: #92400E;
      line-height: 1.4;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">SMRUTI <span>VITALITY</span></div>
      <div class="title">Full Body Physiological Checkup Report</div>
    </div>
    <div style="text-align:right; font-size:11px; color:#6B7280;">
      <div>Method: Optical Photoplethysmography (PPG)</div>
      <div>Sensor: Smartphone CMOS + LED Matrix</div>
    </div>
  </div>

  <div class="patient-card">
    <div class="patient-col">
      <div>Patient Name: <strong style="color:#111827; font-size:13px;">${patientName}</strong></div>
      <div>Test Mode: <strong>Resting Continuous 20-Second Acquisition</strong></div>
    </div>
    <div class="patient-col" style="text-align:right;">
      <div>Date & Time: <strong>${dateStr}</strong></div>
      <div>Checkup ID: <strong>SMRUTI-${Date.now().toString(36).toUpperCase()}</strong></div>
    </div>
  </div>

  <div class="waveform-card">
    <div class="waveform-header">
      <span>Pulse Waveform Dynamics (Arterial Inflow)</span>
      <span>20 Hz Continuous Trace · Filtered 0.7 - 3.5 Hz</span>
    </div>
    <svg width="100%" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <!-- Background Grid -->
      <line x1="${plotLeft}" y1="${plotTop}" x2="${plotRight}" y2="${plotTop}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3" />
      <line x1="${plotLeft}" y1="${plotTop + plotH * 0.5}" x2="${plotRight}" y2="${plotTop + plotH * 0.5}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3" />
      <line x1="${plotLeft}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" stroke="rgba(255,255,255,0.15)" />

      <line x1="${plotLeft + plotW * 0.25}" y1="${plotTop}" x2="${plotLeft + plotW * 0.25}" y2="${plotBottom}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3" />
      <line x1="${plotLeft + plotW * 0.5}" y1="${plotTop}" x2="${plotLeft + plotW * 0.5}" y2="${plotBottom}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3" />
      <line x1="${plotLeft + plotW * 0.75}" y1="${plotTop}" x2="${plotLeft + plotW * 0.75}" y2="${plotBottom}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3" />

      <!-- Axes -->
      <line x1="${plotLeft}" y1="${plotTop}" x2="${plotLeft}" y2="${plotBottom}" stroke="#9CA3AF" stroke-width="1.2" />
      <line x1="${plotLeft}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" stroke="#9CA3AF" stroke-width="1.2" />

      <!-- Y Axis Ticks & Labels -->
      <text x="${plotLeft - 8}" y="${plotTop + 4}" fill="#9CA3AF" font-size="9" text-anchor="end">1.0</text>
      <text x="${plotLeft - 8}" y="${plotTop + plotH * 0.5 + 3}" fill="#9CA3AF" font-size="9" text-anchor="end">0.5</text>
      <text x="${plotLeft - 8}" y="${plotBottom + 3}" fill="#9CA3AF" font-size="9" text-anchor="end">0.0</text>
      <text x="${plotLeft - 26}" y="${plotTop + plotH * 0.5 + 4}" fill="#D8B26B" font-size="9" font-weight="600" text-anchor="middle" transform="rotate(-90 ${plotLeft - 26} ${plotTop + plotH * 0.5 + 4})">Amp (a.u.)</text>

      <!-- X Axis Ticks & Labels -->
      <text x="${plotLeft}" y="${plotBottom + 14}" fill="#9CA3AF" font-size="9" text-anchor="middle">0s</text>
      <text x="${plotLeft + plotW * 0.25}" y="${plotBottom + 14}" fill="#9CA3AF" font-size="9" text-anchor="middle">1s</text>
      <text x="${plotLeft + plotW * 0.5}" y="${plotBottom + 14}" fill="#9CA3AF" font-size="9" text-anchor="middle">2s</text>
      <text x="${plotLeft + plotW * 0.75}" y="${plotBottom + 14}" fill="#9CA3AF" font-size="9" text-anchor="middle">3s</text>
      <text x="${plotRight}" y="${plotBottom + 14}" fill="#9CA3AF" font-size="9" text-anchor="middle">4s</text>
      <text x="${plotLeft + plotW * 0.5}" y="${plotBottom + 26}" fill="#D8B26B" font-size="9" font-weight="600" text-anchor="middle">Time (seconds)</text>

      <!-- Waveform Polyline -->
      <polyline
        fill="none"
        stroke="#10B981"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        points="${polylinePoints}"
      />
    </svg>
  </div>

  <table class="table">
    <thead>
      <tr>
        <th style="width:38%;">Health Parameter / Test</th>
        <th style="width:24%;">Estimated Value</th>
        <th style="width:23%;">Clinical Reference Range</th>
        <th style="width:15%;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item, idx) => {
        const prevItem = items[idx - 1];
        const showCategoryHeader = !prevItem || prevItem.category !== item.category;
        const badgeClass = item.status === 'Optimal' ? 'badge-optimal' : item.status === 'Normal' ? 'badge-normal' : item.status === 'Borderline' ? 'badge-borderline' : 'badge-elevated';
        return `
          ${showCategoryHeader ? `<tr class="category-row"><td colspan="4">${item.category}</td></tr>` : ''}
          <tr>
            <td><strong>${item.name}</strong></td>
            <td><strong>${item.value} ${item.unit}</strong></td>
            <td>${item.range}</td>
            <td><span class="badge ${badgeClass}">${item.status}</span></td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="disclaimer">
    <strong>REGULATORY & CLINICAL SCREENING NOTICE:</strong><br>
    This report is generated by a non-invasive smartphone optical research prototype utilizing photoplethysmography (PPG).
    Heart rate, HRV (RMSSD, SDNN, pNN50), heart rate range, systolic upstroke time, reflection index, and perfusion index (AC/DC) are measured directly from the captured pulse waveform. Vascular elasticity, autonomic stress score, and respiration rate are derived signal-based indicators. Measurement Consistency reflects capture quality, not a physiological value. None of these are calibrated against a clinical reference instrument.
    Blood Pressure, when shown, is a one-point-calibrated estimate anchored to a real cuff reading the user entered manually (see BP Calibration Age below) — it is not measured by the camera and its accuracy degrades between recalibrations. It is not shown at all if no calibration was provided.
    <strong>This report is for general wellness, screening, and awareness purposes only and does NOT constitute a laboratory diagnostic test or clinical diagnosis.</strong>
    It does not measure blood glucose or blood oxygen. For medical decisions, consult a licensed physician and conduct standardized clinical laboratory blood work.
  </div>
</body>
</html>
  `;

  try {
    const { uri, base64 } = await Print.printToFileAsync({ html, base64: true });

    // On Android / Expo Go, Print.printToFileAsync saves into the host app's unscoped cache,
    // which triggers "Not allowed to read file under given URL" in ExpoSharing.
    // Writing or copying into the scoped documentDirectory or cacheDirectory makes it accessible.
    const targetDir = documentDirectory ?? cacheDirectory;
    let shareUri = uri;
    if (targetDir) {
      const filename = `SMRUTI_Checkup_Report_${Date.now()}.pdf`;
      const targetUri = `${targetDir}${filename}`;
      try {
        if (base64) {
          await writeAsStringAsync(targetUri, base64, {
            encoding: EncodingType.Base64,
          });
          shareUri = targetUri;
        } else {
          await copyAsync({ from: uri, to: targetUri });
          shareUri = targetUri;
        }
      } catch (copyErr) {
        console.warn('Failed to relocate PDF to scoped directory, attempting share with original uri:', copyErr);
      }
    }

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(shareUri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: 'Download Full Body Health Report',
      });
    } else {
      await Print.printAsync({ html });
    }
  } catch (err) {
    console.error('Failed to generate or share report PDF:', err);
    throw err;
  }
}
