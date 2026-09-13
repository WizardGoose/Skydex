import React, { useRef, useState } from "react";
import { X } from "lucide-react";
import raw from "./tour.md?raw";
import { hasAuthoredPage, parseTour } from "./tourContent";
import { TourStepView } from "./TourStepView";
import { FOCUS, LABEL } from "../../ui/kit";
import { VectorMark } from "../../mark";

/**
 * The tour's inside: the steps parsed from `tour.md`, the pager, and the
 * footer. WelcomeTour loads it in place only when the introduction opens.
 */

const STEPS = parseTour(raw);

/*
 * The footer's buttons are not the kit's bordered BTN family, and that is the
 * point. Two boxed buttons on one row read as two equal offers, so a bordered
 * "Skip" advertised leaving the tour as hard as the tour advertised itself,
 * and the box around Next made a plain pager control look like a feature. The
 * kit's own language covers this: subtle borders, glass, underline. So the way
 * out is quiet underlined text and the way forward is a single glass pill.
 *
 * FOCUS is still on all three. Dropping the border does not drop the keyboard
 * user, and the ring is the only thing they have to go on here.
 */
const FOOT_QUIET = `cursor-pointer text-[12px] text-slate-400 transition-colors hover:text-slate-100 ${FOCUS}`;
const FOOT_SKIP = `${FOOT_QUIET} underline decoration-white/20 underline-offset-4 hover:decoration-emerald-400/60`;
const FOOT_NEXT =
  `cursor-pointer rounded-md bg-emerald-500/18 px-3.5 py-1.5 text-[12.5px] font-semibold text-emerald-100 ` +
  `transition-colors hover:bg-emerald-500/28 active:translate-y-px ${FOCUS}`;

export const TourBody: React.FC<{ finish: () => void; hostWonder?: boolean }> = ({ finish, hostWonder = true }) => {
  const [step, setStep] = useState(0);
  const dialogueRef = useRef<HTMLDivElement | null>(null);
  /* The two-stage skip: the first click renames the button to its confirm
     text, the second one skips. Arms per step and disarms on navigation, so
     a half-armed skip can never carry over to a page it was not aimed at. */
  const [skipArmed, setSkipArmed] = useState(false);
  const last = step === STEPS.length - 1;

  if (STEPS.length === 0) {
    /* An empty tour.md is an authoring accident; showing an empty window
       would make it look like the site broke. */
    finish();
    return null;
  }

  const current = STEPS[step];
  const showWonder = hostWonder && current.blocks.some((block) => block.kind === "wordmark");
  const go = (next: number) => {
    setSkipArmed(false);
    setStep(next);
  };

  const counter = (
    <span className={LABEL}>
      {step + 1} / {STEPS.length}
    </span>
  );

  /* Back is built once and placed in whichever zone is free: the left, or the
     right when an authored skip has taken the left. Two copies of the button
     could drift apart; one that moves cannot. */
  const back =
    step > 0 ? (
      <button type="button" onClick={() => go(step - 1)} className={FOOT_QUIET}>
        Back
      </button>
    ) : null;

  return (
    <div className="flex w-full flex-col items-center">
      {showWonder && (
        <div
          className="relative z-10 mb-2 flex justify-center [filter:drop-shadow(0_18px_28px_rgb(0_0_0/0.55))]"
          aria-label="Wonder"
        >
          <VectorMark
            alert
            thinking={false}
            attentionTargetRef={dialogueRef}
            ambient
            className="aspect-[35/12] w-[15rem] overflow-visible sm:w-[19rem]"
          />
        </div>
      )}

      <div
        ref={dialogueRef}
        className="sd-lip relative w-full rounded-[0.62rem] border border-cyan-400/25 bg-slate-950/80 p-5 shadow-[0_24px_80px_rgb(0_0_0/0.55)] backdrop-blur-xl sm:p-6"
      >
        <button
          type="button"
          onClick={finish}
          aria-label="Close welcome"
          className={`absolute right-3 top-3 z-10 cursor-pointer rounded-md p-2 text-slate-300 transition-colors hover:bg-white/8 hover:text-slate-50 active:translate-y-px ${FOCUS}`}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex min-h-[14rem] items-center pr-7 sm:min-h-[15rem]">
          <TourStepView
            step={current}
            index={step}
            count={STEPS.length}
            renderWordmark={false}
            onLeave={finish}
          />
        </div>

        {/*
          Three zones. The outer two are `flex-1` so they take an equal share of
          the row, which is what actually centres the middle one; `justify-between`
          alone would only centre it when the two ends happened to be the same
          width, which a skip label and a Next button never are.

          A long skip label wraps inside its own half rather than reaching across
          it, so the counter holds the centre. The one shape that would move it is
          a label with no space to break at, because a flex item cannot be squeezed
          narrower than its longest word; it would push the counter aside rather
          than sit underneath it, which is the right way round to fail.
        */}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
          <span className="flex flex-1 items-center gap-3">
            {/* A step that never mentions [page] keeps the counter here, where it
                has always been. Any authored placement, or a deliberate silence,
                speaks for itself and this must not talk over it. */}
            {!hasAuthoredPage(current) && counter}
            {current.skip ? (
              <button
                type="button"
                className={FOOT_SKIP}
                onClick={() => {
                  if (current.skip?.confirm && !skipArmed) setSkipArmed(true);
                  else finish();
                }}
              >
                {skipArmed && current.skip.confirm ? current.skip.confirm : current.skip.label}
              </button>
            ) : (
              back
            )}
          </span>

          {/* Written beside the footer markers, so it sits between the buttons. */}
          {current.pageInFooter && <span className="shrink-0">{counter}</span>}

          <div className="flex flex-1 items-center justify-end gap-2">
            {current.skip && back}
            <button type="button" onClick={() => (last ? finish() : go(step + 1))} className={FOOT_NEXT}>
              {current.nextLabel ?? (last ? "Start grinding" : "Next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TourBody;
