import React, { useEffect, useRef } from 'react';

const DEVELOPMENT_SITE_KEY = '1x00000000000000000000AA';
const SCRIPT_ID = 'workingbeam-turnstile-script';

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileWidget({ action, resetKey, onToken }: {
  action: 'register' | 'login' | 'resend';
  resetKey: number;
  onToken: (token: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string>();
  const siteKey = process.env.REACT_APP_TURNSTILE_SITE_KEY || DEVELOPMENT_SITE_KEY;

  useEffect(() => {
    let cancelled = false;
    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme: 'light',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    };
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    if (window.turnstile) render(); else script.addEventListener('load', render);
    return () => {
      cancelled = true;
      script?.removeEventListener('load', render);
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = undefined;
    };
  }, [action, onToken, resetKey, siteKey]);

  return <div className="turnstile-widget" ref={containerRef} aria-label="Security challenge" />;
}
