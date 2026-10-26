"use client";

import { useEffect, type ReactNode } from "react";

// §W38 — admin / office pages par browser ka auto-translate band. Root layout
// `<html lang="ur">` hai jab ke admin ka text Roman Urdu / English (Latin) mein
// hai — Chrome page ko Urdu samajh kar English tarjuma karta hai. Google
// Translate har text node ko <font> mein lapet deta hai; React jab wahi text
// badalta hai (upload progress, live refresh, modal) to
// "NotFoundError: insertBefore / removeChild" aur poora page "Application
// error" ho jata hai. Teen tah: layout ka <meta name="google"
// content="notranslate"> (server), ye wrapper (translate="no" + notranslate),
// aur <html translate="no"> jab tak admin / office page khula ho (root body ke
// widgets bhi). Public website par asar nahi — wahan se nikalte hi wapas.
export default function NoTranslate({ children }: { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.getAttribute("translate");
    const hadClass = html.classList.contains("notranslate");
    html.setAttribute("translate", "no");
    html.classList.add("notranslate");
    return () => {
      if (previous === null) html.removeAttribute("translate");
      else html.setAttribute("translate", previous);
      if (!hadClass) html.classList.remove("notranslate");
    };
  }, []);

  return (
    <div translate="no" className="notranslate">
      {children}
    </div>
  );
}
