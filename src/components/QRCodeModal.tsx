import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, Download, ExternalLink, QrCode as QrIcon } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  guestUrl: string;
  eventName: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  isOpen,
  onClose,
  guestUrl,
  eventName,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && guestUrl) {
      QRCode.toDataURL(guestUrl, {
        width: 480,
        margin: 2,
        color: {
          dark: '#1C1B1A',
          light: '#FFFFFF',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR code generation error:', err));
    }
  }, [isOpen, guestUrl]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(guestUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `${eventName.replace(/[^a-zA-Z0-9]/g, '_')}_QR.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#FAF9F5] border border-[#E4DEC3]/80 rounded-2xl p-6 shadow-2xl relative text-[#1C1B1A]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close QR Code Modal"
          className="absolute top-4 right-4 p-2 text-[#7A7875] hover:text-[#1C1B1A] hover:bg-[#EAE5D8] rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2 text-[#9E7D46] mb-1">
          <QrIcon className="w-5 h-5" />
          <span className="text-xs uppercase tracking-widest font-semibold">Guest Access</span>
        </div>

        <h3 id="qr-modal-title" className="text-xl font-serif font-bold text-[#1C1B1A] mb-1">
          {eventName}
        </h3>
        <p className="text-xs text-[#6E6D6B] mb-5">
          Print or display this QR code at table settings, signs, or invitations so guests can drop photos instantly without an account.
        </p>

        {/* QR Code Container */}
        <div className="bg-white p-5 rounded-xl border border-[#E8E3D5] flex items-center justify-center mb-5 shadow-inner">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR Code for ${eventName}`}
              className="w-64 h-64 object-contain"
            />
          ) : (
            <div className="w-64 h-64 flex items-center justify-center text-sm text-[#7A7875]">
              Generating QR Code...
            </div>
          )}
        </div>

        {/* Guest Link URL copy bar */}
        <div className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-[#E0DBD0] mb-4">
          <input
            type="text"
            readOnly
            value={guestUrl}
            className="text-xs text-[#4A4947] bg-transparent flex-1 outline-none select-all font-mono truncate"
          />
          <button
            onClick={handleCopy}
            aria-label="Copy guest URL"
            className="flex items-center space-x-1 text-xs font-medium text-[#9E7D46] hover:text-[#846231] px-2 py-1 rounded bg-[#F7F4EB] hover:bg-[#EFE9DC] transition-colors shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleDownload}
            disabled={!qrDataUrl}
            className="flex items-center justify-center space-x-2 py-2.5 px-4 bg-[#1C1B1A] hover:bg-[#333230] text-white text-xs font-semibold rounded-xl transition-all shadow-sm active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            <span>Download PNG</span>
          </button>
          <a
            href={guestUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center space-x-2 py-2.5 px-4 bg-[#EBE5D8] hover:bg-[#E2DDD0] text-[#1C1B1A] text-xs font-semibold rounded-xl transition-all active:scale-[0.98]"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Open Link</span>
          </a>
        </div>
      </div>
    </div>
  );
};
