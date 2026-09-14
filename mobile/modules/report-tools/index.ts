import { requireOptionalNativeModule } from 'expo';
interface ReportTools {
  hashFile(uri: string): Promise<string>;
  pageCount(uri: string): Promise<number>;
  renderPage(uri: string, page: number): Promise<string>;
  renderImage(uri: string): Promise<string>;
  startProcessing(): Promise<void>;
  stopProcessing(): Promise<void>;
  sharedFile(): Promise<{ uri: string; name: string; mimeType: string } | null>;
}
export function reportTools(): ReportTools {
  const native = requireOptionalNativeModule<ReportTools>('ReportTools');
  if (!native) throw new Error('Report processing needs the latest Android APK.');
  return native;
}
