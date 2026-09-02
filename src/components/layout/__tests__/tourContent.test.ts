import { describe, expect, it } from "vitest";
import {
  USERNAME_PATTERN,
  colourOf,
  hasAuthoredPage,
  inputRule,
  inputValid,
  parseSpan,
  parseTour,
  splitSpans,
  stripSpans,
} from "../tourContent";
import shipped from "../tour.md?raw";

/**
 * The tour's authoring format. These tests are the format's contract: the
 * file is hand-written prose, so every rule here is a promise to the person
 * typing it about what their keystrokes will do.
 */

describe("parseTour", () => {
  it("splits steps on --- lines", () => {
    const steps = parseTour("one\n---\ntwo\n---\nthree");
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.blocks[0])).toEqual([
      { kind: "md", text: "one" },
      { kind: "md", text: "two" },
      { kind: "md", text: "three" },
    ]);
  });

  it("takes one leading # line as the step title", () => {
    const [step] = parseTour("# How do you play?\nBody text.");
    expect(step.title).toBe("How do you play?");
    expect(step.blocks).toEqual([{ kind: "md", text: "Body text." }]);
  });

  it("only takes the title from the TOP of a step", () => {
    /* A # line mid-step is markdown, not a second title: the writer said
       "heading inside my text", not "new step". */
    const [step] = parseTour("Intro line.\n# Not a title");
    expect(step.title).toBeNull();
    expect(step.blocks).toEqual([{ kind: "md", text: "Intro line.\n# Not a title" }]);
  });

  it("turns known markers into blocks and leaves text around them intact", () => {
    const [step] = parseTour("Before.\n[mode-picker]\nAfter.");
    expect(step.blocks).toEqual([
      { kind: "md", text: "Before." },
      { kind: "mode-picker", ironman: null, normal: null, converter: null },
      { kind: "md", text: "After." },
    ]);
  });

  it("recognises every block marker, with [logo] as the friendly spelling", () => {
    const [step] = parseTour("[logo]\n[mode-picker]\n[settings-button]\n[input]\n[slider]");
    expect(step.blocks.map((b) => b.kind)).toEqual(["wordmark", "mode-picker", "settings-button", "input", "slider"]);
    /* The old spelling keeps working so a saved draft never breaks. */
    expect(parseTour("[wordmark]")[0].blocks).toEqual([{ kind: "wordmark" }]);
  });

  it("reads marker attributes", () => {
    const [step] = parseTour('[input name="username" placeholder="- - - -" label="Sign here"]');
    expect(step.blocks[0]).toEqual({
      kind: "input",
      name: "username",
      placeholder: "- - - -",
      label: "Sign here",
      line: "dashed",
      colour: null,
      text: null,
      max: null,
      pattern: null,
      invalid: null,
    });
  });

  it("defaults slider bounds and survives junk numbers", () => {
    const [a] = parseTour("[slider]");
    expect(a.blocks[0]).toEqual({ kind: "slider", name: null, label: null, min: 0, max: 100 });
    const [b] = parseTour('[slider min="5" max="nope"]');
    expect(b.blocks[0]).toEqual({ kind: "slider", name: null, label: null, min: 5, max: 100 });
  });

  it("lifts [next] and [skip] into the footer instead of the blocks", () => {
    const [step] = parseTour('Body.\n[next label="I love tutorials!"]\n[skip label="Ugh.." confirm="I REALLY hate tutorials"]');
    expect(step.blocks).toEqual([{ kind: "md", text: "Body." }]);
    expect(step.nextLabel).toBe("I love tutorials!");
    expect(step.skip).toEqual({ label: "Ugh..", confirm: "I REALLY hate tutorials" });
  });

  it("gives [skip] without confirm a one-click skip", () => {
    const [step] = parseTour('[skip label="Skip the tour"]');
    expect(step.skip).toEqual({ label: "Skip the tour", confirm: null });
  });

  it("passes an unknown marker through as text, so a typo stays visible", () => {
    const [step] = parseTour("[mode-pickr]");
    expect(step.blocks).toEqual([{ kind: "md", text: "[mode-pickr]" }]);
  });

  it("drops empty chunks rather than making blank steps", () => {
    expect(parseTour("---\n\n---\nreal\n---")).toHaveLength(1);
    expect(parseTour("")).toHaveLength(0);
  });

  it("tolerates markers with surrounding whitespace", () => {
    const [step] = parseTour("  [wordmark]  ");
    expect(step.blocks).toEqual([{ kind: "wordmark" }]);
  });
});

describe("the shipped tour.md", () => {
  const steps = parseTour(shipped);

  it("parses to at least one step with no empties", () => {
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) expect(step.blocks.length).toBeGreaterThan(0);
  });

  it("still carries the mode choice somewhere", () => {
    /* The one interactive promise the tour makes to the rest of the site:
       Ironman/Normal is chosen during onboarding. Moving it is fine;
       deleting it should be a decision, not a typo. */
    expect(steps.some((s) => s.blocks.some((b) => b.kind === "mode-picker"))).toBe(true);
  });
});

describe("parseSpan", () => {
  it("reads a single token", () => {
    expect(parseSpan("gold:blood partially required")).toEqual({ tokens: ["gold"], text: "blood partially required" });
  });

  it("combines tokens with +", () => {
    expect(parseSpan("hl+bold:read this")).toEqual({ tokens: ["hl", "bold"], text: "read this" });
  });

  it("refuses unknown tokens and colon-less spans, so real code stays code", () => {
    expect(parseSpan("golld:oops")).toBeNull();
    expect(parseSpan("plain code")).toBeNull();
    expect(parseSpan(":leading colon")).toBeNull();
  });

  it("takes a hex colour as a token, three digits or six", () => {
    expect(parseSpan("#ff8800:loud")).toEqual({ tokens: ["#ff8800"], text: "loud" });
    expect(parseSpan("#f80:loud")).toEqual({ tokens: ["#f80"], text: "loud" });
    /* Case means nothing to CSS and is not made to mean anything here. */
    expect(parseSpan("#FF8800:loud")).toEqual({ tokens: ["#ff8800"], text: "loud" });
  });

  it("combines a hex colour with the named tokens, either way round", () => {
    expect(parseSpan("#ff8800+bold:loud")).toEqual({ tokens: ["#ff8800", "bold"], text: "loud" });
    expect(parseSpan("hl+#f80:loud")).toEqual({ tokens: ["hl", "#f80"], text: "loud" });
  });

  it("refuses a hex that is not one, so the typo stays code", () => {
    expect(parseSpan("#ggg:oops")).toBeNull();
    expect(parseSpan("#12345:oops")).toBeNull();
    expect(parseSpan("#:oops")).toBeNull();
    /* One bad token spoils the span, exactly as an unknown word does. */
    expect(parseSpan("#ff8800+golld:oops")).toBeNull();
  });
});

describe("colourOf", () => {
  it("resolves a palette name to its hue and a hex literal to itself", () => {
    expect(colourOf("teal")).toBe("#5ef3df");
    expect(colourOf("#ff8800")).toBe("#ff8800");
  });
});

describe("splitSpans", () => {
  it("hands back each span's source beside the text around it", () => {
    expect(splitSpans("I am `bold:STEVE`.")).toEqual([
      { span: null, text: "I am " },
      { span: "bold:STEVE", text: "STEVE" },
      { span: null, text: "." },
    ]);
  });

  it("does not let a failed pair's closing backtick open the next one", () => {
    expect(splitSpans("`nope` `gold:yes`")).toEqual([
      { span: null, text: "`nope` " },
      { span: "gold:yes", text: "yes" },
    ]);
  });
});

describe("stripSpans", () => {
  /* What a native placeholder can hold: the words, never the styling. */
  it("keeps a span's words and drops its styling", () => {
    expect(stripSpans("I am `bold:STEVE`.")).toBe("I am STEVE.");
    expect(stripSpans("`red+bold:Prick `your finger!")).toBe("Prick your finger!");
    expect(stripSpans("`#ff8800:loud`")).toBe("loud");
  });

  it("leaves a string that holds no span exactly as it was", () => {
    expect(stripSpans("- - - - -")).toBe("- - - - -");
    expect(stripSpans("")).toBe("");
  });

  it("leaves a span that is not one exactly as typed, so the typo stays visible", () => {
    expect(stripSpans("I am `golld:STEVE`.")).toBe("I am `golld:STEVE`.");
    expect(stripSpans("`plain code`")).toBe("`plain code`");
    expect(stripSpans("a `lone backtick")).toBe("a `lone backtick");
  });

  it("reads every span in the string, not just the first", () => {
    expect(stripSpans("`gold:one` and `teal:two`")).toBe("one and two");
  });
});

describe("[page]", () => {
  it("carries the hidden flag, bare or explicit", () => {
    expect(parseTour("[page hidden]")[0].blocks[0]).toEqual({ kind: "page", hidden: true });
    expect(parseTour('[page hidden="true"]')[0].blocks[0]).toEqual({ kind: "page", hidden: true });
    expect(parseTour("[page]")[0].blocks[0]).toEqual({ kind: "page", hidden: false });
  });

  it("is a block the author can place", () => {
    const [step] = parseTour("Before.\n[page]\nAfter.");
    expect(step.blocks.map((b) => b.kind)).toEqual(["md", "page", "md"]);
    expect(step.pageInFooter).toBe(false);
  });

  it("joins the footer when written under a footer marker", () => {
    const [step] = parseTour('[skip label="Nah"]\n[page]');
    expect(step.pageInFooter).toBe(true);
    expect(step.blocks.some((b) => b.kind === "page")).toBe(false);
  });

  it("joins the footer when written above a footer marker", () => {
    const [step] = parseTour('[page]\n[next label="Onward"]');
    expect(step.pageInFooter).toBe(true);
    expect(step.blocks.some((b) => b.kind === "page")).toBe(false);
  });

  it("joins the footer from between the two footer markers", () => {
    const [step] = parseTour('[skip label="Nah"]\n[page]\n[next label="Onward"]');
    expect(step.pageInFooter).toBe(true);
    expect(step.skip).toEqual({ label: "Nah", confirm: null });
    expect(step.nextLabel).toBe("Onward");
    expect(step.blocks).toEqual([]);
  });

  it("still joins the footer across blank lines", () => {
    const [step] = parseTour('Body text.\n\n[skip label="Nah"]\n\n[page]\n');
    expect(step.pageInFooter).toBe(true);
    expect(step.blocks).toEqual([{ kind: "md", text: "Body text." }]);
  });

  it("stays a body block when prose separates it from the footer markers", () => {
    const [step] = parseTour('[skip label="Nah"]\n\nBody text.\n\n[page]');
    expect(step.pageInFooter).toBe(false);
    expect(step.blocks.map((b) => b.kind)).toEqual(["md", "page"]);
  });

  it("stays a body block beside a marker that is not a footer marker", () => {
    const [step] = parseTour("[logo]\n[page]");
    expect(step.pageInFooter).toBe(false);
    expect(step.blocks.map((b) => b.kind)).toEqual(["wordmark", "page"]);
  });

  it("closes the prose over a page it lifts into the footer", () => {
    /* Same as [skip] and [next]: a lifted marker must not split the paragraph
       it was typed inside. */
    const [step] = parseTour('Before.\n[page]\n[next label="Onward"]\nAfter.');
    expect(step.blocks).toEqual([{ kind: "md", text: "Before.\nAfter." }]);
  });

  it("reports a hidden page as hidden rather than as a footer counter", () => {
    const [step] = parseTour('[skip label="Nah"]\n[page hidden]');
    expect(step.hiddenPage).toBe(true);
    expect(step.pageInFooter).toBe(false);
    expect(step.blocks.some((b) => b.kind === "page")).toBe(false);
  });

  it("reports a hidden page written in the body, keeping its block", () => {
    const [step] = parseTour("Before.\n[page hidden]\nAfter.");
    expect(step.hiddenPage).toBe(true);
    expect(step.pageInFooter).toBe(false);
    expect(step.blocks.map((b) => b.kind)).toEqual(["md", "page", "md"]);
  });

  it("keeps a step alive whose only content is a lifted page", () => {
    /* A bare [next] sets no label, so nothing else in this step would have
       survived the empty-chunk check. */
    const steps = parseTour("[page]\n[next]");
    expect(steps).toHaveLength(1);
    expect(steps[0].pageInFooter).toBe(true);
  });

  it("leaves both page flags off a step that never mentions it", () => {
    const [step] = parseTour('Body text.\n[skip label="Nah"]');
    expect(step.pageInFooter).toBe(false);
    expect(step.hiddenPage).toBe(false);
  });
});

describe("[mode-picker] attributes", () => {
  const picker = (src: string) =>
    parseTour(src)[0].blocks[0] as Extract<ReturnType<typeof parseTour>[0]["blocks"][0], { kind: "mode-picker" }>;

  it("reads all three sublines", () => {
    const block = picker('[mode-picker ironman="Gather it" normal="Buy it" converter="Both, allegedly"]');
    expect(block.ironman).toBe("Gather it");
    expect(block.normal).toBe("Buy it");
    expect(block.converter).toBe("Both, allegedly");
  });

  it("leaves every subline null when none are written, so the built-in wording stands", () => {
    const block = picker("[mode-picker]");
    expect(block.ironman).toBeNull();
    expect(block.normal).toBeNull();
    expect(block.converter).toBeNull();
  });

  it("takes each attribute on its own, so a rewritten card does not summon the third", () => {
    /* converter= is what puts the joke card on screen, and it is the only
       attribute that adds anything. Rewriting a subline must not. */
    expect(picker('[mode-picker ironman="Gather it"]').converter).toBeNull();
    expect(picker('[mode-picker normal="Buy it"]').converter).toBeNull();
    const third = picker('[mode-picker converter="Functionally Normal"]');
    expect(third.converter).toBe("Functionally Normal");
    expect(third.ironman).toBeNull();
    expect(third.normal).toBeNull();
  });

  it("keeps whatever was typed, because any string is a usable subline", () => {
    /* There is no vocabulary to spell wrongly here, unlike a colour or a line
       style, so nothing falls back: junk is simply the words on the card. */
    expect(picker('[mode-picker converter="!!! 42 !!!"]').converter).toBe("!!! 42 !!!");
  });
});

describe("[input] control attributes", () => {
  const first = (src: string) => parseTour(src)[0].blocks[0] as Extract<ReturnType<typeof parseTour>[0]["blocks"][0], { kind: "input" }>;

  it("reads line, colour, max, pattern and invalid", () => {
    const block = first('[input line="dotted" colour="gold" max="16" pattern="[A-Z]+" invalid="Capitals only"]');
    expect(block.line).toBe("dotted");
    expect(block.colour).toBe("gold");
    expect(block.max).toBe(16);
    expect(block.pattern).toBe("[A-Z]+");
    expect(block.invalid).toBe("Capitals only");
  });

  it("falls back on junk the way the slider does", () => {
    const block = first('[input line="wavy" colour="golld" max="nope"]');
    expect(block.line).toBe("dashed");
    expect(block.colour).toBeNull();
    expect(block.max).toBeNull();
    expect(first('[input max="0"]').max).toBeNull();
  });

  it("takes a hex colour as well as a palette name, storing what was typed", () => {
    /* The written form is kept and resolved at render, so a parsed block still
       reads as the line that produced it. */
    expect(first('[input colour="#5ef3df"]').colour).toBe("#5ef3df");
    expect(first('[input colour="#5EF"]').colour).toBe("#5EF");
    expect(first('[input colour="gold"]').colour).toBe("gold");
  });

  it("drops a colour that is neither a name nor a hex", () => {
    expect(first('[input colour="#nope"]').colour).toBeNull();
    expect(first('[input colour="#12345"]').colour).toBeNull();
  });

  it("reads text= as the typed value's colour, by name or by hex", () => {
    /* Same written-form-kept rule the line's colour follows, and the same
       vocabulary, so neither channel can honour a spelling the other will not. */
    expect(first('[input text="gold"]').text).toBe("gold");
    expect(first('[input text="#5ef3df"]').text).toBe("#5ef3df");
    expect(first('[input text="#5EF"]').text).toBe("#5EF");
  });

  it("drops a text colour that is neither a name nor a hex", () => {
    expect(first('[input text="golld"]').text).toBeNull();
    expect(first('[input text="#nope"]').text).toBeNull();
    expect(first('[input text="#12345"]').text).toBeNull();
  });

  it("leaves text null when it is not written, so the default slate stands", () => {
    expect(first("[input]").text).toBeNull();
  });

  it("colours the line and the writing on it independently", () => {
    /* The pair this attribute exists for: a gold line under default writing,
       and the reverse. One attribute doing both could say neither. */
    const block = first('[input colour="gold" text="teal"]');
    expect(block.colour).toBe("gold");
    expect(block.text).toBe("teal");
    expect(first('[input colour="gold"]').text).toBeNull();
    expect(first('[input text="teal"]').colour).toBeNull();
  });

  it("keeps an explicit empty pattern, because it spells checking off", () => {
    expect(first('[input pattern=""]').pattern).toBe("");
    expect(first("[input]").pattern).toBeNull();
  });
});

describe("inputRule", () => {
  it("gives the username binding the Minecraft rule unasked", () => {
    expect(inputRule({ name: "username", pattern: null })).toBe(USERNAME_PATTERN);
  });

  it("lets an authored pattern override it, and an empty one remove it", () => {
    expect(inputRule({ name: "username", pattern: "[A-Z]+" })).toBe("[A-Z]+");
    expect(inputRule({ name: "username", pattern: "" })).toBeNull();
  });

  it("checks nothing for an unbound input with no pattern", () => {
    expect(inputRule({ name: null, pattern: null })).toBeNull();
    expect(inputRule({ name: "guestbook", pattern: null })).toBeNull();
  });

  it("still honours a pattern an author writes on an unbound line", () => {
    expect(inputRule({ name: "guestbook", pattern: "[A-Za-z0-9-]+" })).toBe("[A-Za-z0-9-]+");
  });
});

describe("inputValid", () => {
  it("never scolds an empty line or an unchecked one", () => {
    expect(inputValid("", USERNAME_PATTERN)).toBe(true);
    expect(inputValid("anything at all", null)).toBe(true);
  });

  it("holds the whole value to the rule, not a fragment of it", () => {
    expect(inputValid("Wizard", USERNAME_PATTERN)).toBe(true);
    expect(inputValid("Wizard!", USERNAME_PATTERN)).toBe(false);
    expect(inputValid("W", USERNAME_PATTERN)).toBe(false);
    expect(inputValid("W".repeat(17), USERNAME_PATTERN)).toBe(false);
  });

  it("treats a broken regex as no check rather than as always failing", () => {
    expect(inputValid("anything", "[unclosed")).toBe(true);
  });
});

describe("hasAuthoredPage", () => {
  it("is false for a step with no [page], so the footer keeps its own counter", () => {
    expect(hasAuthoredPage(parseTour("Body text.")[0])).toBe(false);
  });

  it("is true for a page in the body, in the footer, or hidden", () => {
    expect(hasAuthoredPage(parseTour("[page]")[0])).toBe(true);
    expect(hasAuthoredPage(parseTour('[page]\n[next label="Onward"]')[0])).toBe(true);
    expect(hasAuthoredPage(parseTour("[page hidden]")[0])).toBe(true);
    expect(hasAuthoredPage(parseTour('[skip label="Nah"]\n[page hidden]')[0])).toBe(true);
  });
});
