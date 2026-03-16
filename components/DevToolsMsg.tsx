'use client';
import { useEffect } from 'react';

export default function DevToolsMsg() {
  useEffect(() => {
    const art = `
%c
  ██████  ██████  ██    ██ ██  ██████   ██████  ██      ███████ 
 ██      ██    ██ ██    ██ ██ ██       ██       ██      ██      
  █████  ██    ██ ██    ██ ██ ██   ███ ██   ███ ██      █████   
      ██ ██ ▄▄ ██ ██    ██ ██ ██    ██ ██    ██ ██      ██      
 ██████   ██████   ██████  ██  ██████   ██████  ███████ ███████ 
             ▀▀                                                  
`;
    console.log(
      art,
      'font-family: monospace; color: #ffffff; background: #09090b; padding: 4px 0; line-height: 1.2;'
    );
    console.log(
      '%c👀 oh hey, a curious one.',
      'font-size: 16px; font-weight: bold; color: #ffffff;'
    );
    console.log(
      '%cnice try — the secret word lives on the server, not here 😇',
      'font-size: 13px; color: #71717a;'
    );
    console.log(
      '%cif you find a real bug though, we\'d love to hear about it.',
      'font-size: 12px; color: #52525b;'
    );
  }, []);

  return null;
}
