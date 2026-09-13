import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function WardrobeScroll({ children, label, open }: { children: ReactNode; label: string; open: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, max: 0 });
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => setPosition({ left: element.scrollLeft, max: Math.max(0, element.scrollWidth - element.clientWidth) });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, [open]);
  const move = (direction: number) => viewport.current?.scrollBy({ left: direction * 120, behavior: "smooth" });
  return <div className={`profile-wardrobe-scroll${position.max > 1 ? " is-overflowing" : ""}`}>
    <button type="button" aria-label={`Scroll ${label} left`} disabled={position.left <= 1} onClick={() => move(-1)}><ChevronLeft size={16} /></button>
    <div className="profile-wardrobe-scroll-body" ref={viewport} tabIndex={0} role="region" aria-label={`${label} slots`}>{children}</div>
    <button type="button" aria-label={`Scroll ${label} right`} disabled={position.left >= position.max - 1} onClick={() => move(1)}><ChevronRight size={16} /></button>
  </div>;
}
