import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download, Share2, X } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import './AgentCombinationShare.css';

type CopyStatus = 'idle' | 'copied' | 'error';

function copyTextWithSelection(value: string) {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();

  return copied;
}

async function copyText(value: string) {
  if (copyTextWithSelection(value)) {
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  throw new Error('Clipboard copy failed.');
}

function getQrFileName(recommendationId: string) {
  const safeId = recommendationId.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 72);

  return `agent-hero-hall-${safeId || 'recommendation'}.png`;
}

export function AgentCombinationShare({
  entryTitle,
  recommendationId,
  shareUrl,
}: {
  entryTitle: string;
  recommendationId: string;
  shareUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [qrDownloadUrl, setQrDownloadUrl] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const background = triggerRef.current?.closest('main') || document.getElementById('root');
    const backgroundWasInert = background?.hasAttribute('inert') ?? false;
    const previousBackgroundAriaHidden = background?.getAttribute('aria-hidden') ?? null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const dialogElement = dialogRef.current;
      const focusableElements = dialogElement
        ? Array.from(
            dialogElement.querySelectorAll<HTMLElement>(
              'a[href]:not([aria-disabled="true"]), button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((element) => element.offsetParent !== null)
        : [];

      if (!dialogElement || focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === firstElement || !dialogElement.contains(activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.body.style.overflow = 'hidden';
    background?.setAttribute('inert', '');
    background?.setAttribute('aria-hidden', 'true');
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (!backgroundWasInert) {
        background?.removeAttribute('inert');
      }
      if (previousBackgroundAriaHidden === null) {
        background?.removeAttribute('aria-hidden');
      } else {
        background?.setAttribute('aria-hidden', previousBackgroundAriaHidden);
      }
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [open]);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) {
      setQrDownloadUrl('');
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      const canvas = qrCanvasRef.current;
      setQrDownloadUrl(canvas ? canvas.toDataURL('image/png') : '');
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, shareUrl]);

  const openShare = () => {
    setCopyStatus('idle');
    setOpen(true);
  };

  const copyShareUrl = async () => {
    try {
      await copyText(shareUrl);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }

    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => setCopyStatus('idle'), 2400);
  };

  const dialog = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="agent-combination-share-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <section
            aria-labelledby={titleId}
            aria-modal="true"
            className="agent-combination-share-dialog"
            ref={dialogRef}
            role="dialog"
          >
            <header className="agent-combination-share-header">
              <span aria-hidden="true">
                <Share2 size={19} />
              </span>
              <div>
                <strong id={titleId}>分享英雄殿堂</strong>
                <em title={entryTitle}>{entryTitle}</em>
              </div>
              <button aria-label="关闭分享" onClick={() => setOpen(false)} ref={closeButtonRef} title="关闭" type="button">
                <X size={18} />
              </button>
            </header>

            <div className="agent-combination-share-qr">
              <QRCodeCanvas
                aria-label={`${entryTitle}分享二维码`}
                bgColor="#f7fbff"
                fgColor="#06162a"
                level="H"
                marginSize={3}
                ref={qrCanvasRef}
                role="img"
                size={640}
                value={shareUrl}
              />
            </div>

            <div className="agent-combination-share-link">
              <span>殿堂链接</span>
              <code title={shareUrl}>{shareUrl}</code>
            </div>

            <div className="agent-combination-share-actions">
              <button className={copyStatus === 'copied' ? 'is-success' : ''} onClick={copyShareUrl} type="button">
                {copyStatus === 'copied' ? <Check size={17} /> : <Copy size={17} />}
                <span>{copyStatus === 'copied' ? '已复制' : '复制链接'}</span>
              </button>
              <a aria-disabled={!qrDownloadUrl} download={getQrFileName(recommendationId)} href={qrDownloadUrl || undefined}>
                <Download size={17} />
                <span>保存二维码</span>
              </a>
            </div>

            {copyStatus === 'error' ? <span className="agent-combination-share-error" role="status">复制失败，请重试</span> : null}
          </section>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="agent-combination-share-control">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="agent-combination-share-trigger"
        onClick={openShare}
        ref={triggerRef}
        type="button"
      >
        <Share2 size={15} />
        <span>分享殿堂</span>
      </button>
      {dialog}
    </div>
  );
}
