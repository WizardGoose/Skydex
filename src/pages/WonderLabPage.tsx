import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { VectorMark } from "../mark";
import { WONDER_LAB_PREVIEWS } from "../mark/lab";
import type { MotionStep, WonderLabPreview } from "../mark/lab";
import { PERSONALITY_CLIPS } from "../mark/personality";

const useMotionSequence = (steps: readonly MotionStep[]): MotionStep => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (steps.length <= 1) return;
    const id = window.setTimeout(() => setIndex((current) => (current + 1) % steps.length), steps[index].ms);
    return () => window.clearTimeout(id);
  }, [index, steps]);

  return steps[index];
};

const MotionPreview: React.FC<{ preview: WonderLabPreview }> = ({ preview }) => {
  const step = useMotionSequence(preview.steps);

  return (
    <article
      data-wonder-preview={preview.id}
      data-motion-state={step.force}
      data-rig-state={step.personality ?? step.rig ?? "auto"}
      className="flex min-h-[190px] flex-col rounded-xl border border-white/10 bg-slate-950/55 px-4 py-3.5 backdrop-blur-[18px]"
    >
      <header>
        <h2 className="text-[13px] font-semibold text-slate-100">{preview.title}</h2>
        <p className="mt-0.5 text-[10px] text-slate-500">{preview.note}</p>
      </header>
      <div className="flex flex-1 items-center justify-center pt-4 [filter:drop-shadow(0_4px_18px_rgb(7_8_10/0.7))]">
        <VectorMark
          alert={step.force === "alert"}
          thinking={step.force === "thinking"}
          force={step.force}
          forceRigMode={step.rig}
          forceRigClip={step.personality ? PERSONALITY_CLIPS[step.personality] : undefined}
          className="aspect-[35/12] w-[148px] overflow-visible sm:w-[172px]"
        />
      </div>
    </article>
  );
};

/** Private comparison surface. The route itself exists only in Vite development builds. */
export const WonderLabPage: React.FC = () => (
  <div className="mx-auto w-full max-w-[88rem] px-3 py-5 sm:px-5 lg:px-7">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-sky-400">Development preview</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">Wonder motion board</h1>
        <p className="mt-1 max-w-2xl text-[12px] text-slate-400">
          The live rig and expression system, running together for timing and motion comparison.
        </p>
      </div>
      <Link
        to="/"
        className="rounded-md border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-white/22 hover:text-white"
      >
        Back to Home
      </Link>
    </header>

    <main className="space-y-5">
      <section aria-labelledby="wonder-current-title">
        <h2 id="wonder-current-title" className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
          Current behaviours
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {WONDER_LAB_PREVIEWS.filter((preview) => preview.group === "current").map((preview) => (
            <MotionPreview key={preview.id} preview={preview} />
          ))}
        </div>
      </section>

      <section aria-labelledby="wonder-personality-title">
        <h2 id="wonder-personality-title" className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-sky-400">
          Personality candidates
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {WONDER_LAB_PREVIEWS.filter((preview) => preview.group === "personality").map((preview) => (
            <MotionPreview key={preview.id} preview={preview} />
          ))}
        </div>
      </section>
    </main>
  </div>
);

export default WonderLabPage;
