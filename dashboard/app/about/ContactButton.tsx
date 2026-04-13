"use client";
import { useState } from "react";
import ContactModal from "./ContactModal";

export default function ContactButton({ className, children }: { className: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{children}</button>
      {open && <ContactModal onClose={() => setOpen(false)} />}
    </>
  );
}
