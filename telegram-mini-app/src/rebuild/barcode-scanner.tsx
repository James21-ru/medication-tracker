import { useEffect, useRef, useState } from 'react';
import { Sheet } from './ui/sheet';

export function BarcodeScanner({ onClose, onDetected }: { onClose: () => void; onDetected: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const doneRef = useRef(false);
  const [status, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');
  const stop = () => {
    doneRef.current = true;
    controlsRef.current?.stop();
  };
  const confirm = (value: string) => {
    if (doneRef.current) return;
    const barcode = value.replace(/\s/g, '');
    if (!barcode) { setError('Введите код со штрихкода.'); return; }
    stop();
    onDetected(barcode);
  };
  useEffect(() => {
    let disposed = false;
    doneRef.current = false;
    void (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (disposed || doneRef.current) return;
        const controls = await new BrowserMultiFormatReader().decodeFromConstraints({ audio: false, video: { facingMode: { ideal: 'environment' } } }, videoRef.current ?? undefined, (result) => { if (result && !disposed && !doneRef.current) confirm(result.getText()); });
        if (disposed || doneRef.current) controls.stop(); else { controlsRef.current = controls; setStatus('ready'); }
      } catch { if (!disposed && !doneRef.current) { setStatus('error'); setError('Не удалось открыть камеру. Разрешите доступ к камере или введите код вручную.'); } }
    })();
    return () => { disposed = true; doneRef.current = true; controlsRef.current?.stop(); };
  }, []);
  return <Sheet title="Сканировать штрихкод" onClose={() => { stop(); onClose(); }}><div className="lc-scanner"><h2>Наведите камеру на штрихкод</h2><p>Держите упаковку в рамке. Код останется только в карточке препарата на этом устройстве.</p><div className="lc-scanner__camera"><video ref={videoRef} muted playsInline aria-label="Камера для сканирования штрихкода" /><i />{status === 'starting' ? <span>Открываем камеру…</span> : null}{status === 'error' ? <span>Камера недоступна</span> : null}</div><label className="lc-field">Код под штрихкодом<input inputMode="numeric" value={manual} onChange={(event) => { setManual(event.target.value); setError(''); }} placeholder="Например, 4601234567890" /></label><button className="lc-secondary-button" onClick={() => confirm(manual)}>Использовать введенный код</button>{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</div></Sheet>;
}
