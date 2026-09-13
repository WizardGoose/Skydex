package com.skydex.gui;

import com.skydex.SkydexTheme;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.TextCursorUtils;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.function.ToIntFunction;

/**
 * A compact text field whose drawing and cursor geometry use the same Skydex font metrics.
 * Minecraft's stock field measures plain strings with the default font even when a formatter
 * paints a custom face, which makes long share URLs overlap and scroll incorrectly.
 */
final class SkydexEditBox extends EditBox {

    static final int TEXT_HEIGHT = 15;

    private final Font skydexFont;
    private Component visualHint = Component.empty();
    private int visualTextColor = DEFAULT_TEXT_COLOR;
    private int visualUneditableColor = DEFAULT_TEXT_COLOR;
    private int visualHighlightPos;
    private int displayStart;
    private boolean editable = true;
    private long focusedAt;

    SkydexEditBox(Font font, int x, int y, int width, int height, Component narration) {
        super(font, x, y, width, height, narration);
        this.skydexFont = font;
        super.setBordered(false);
        super.setTextShadow(false);
    }

    @Override
    public void setTextColor(int color) {
        visualTextColor = color;
        super.setTextColor(color);
    }

    @Override
    public void setTextColorUneditable(int color) {
        visualUneditableColor = color;
        super.setTextColorUneditable(color);
    }

    @Override
    public void setEditable(boolean editable) {
        this.editable = editable;
        super.setEditable(editable);
    }

    @Override
    public void setHint(Component hint) {
        visualHint = hint == null ? Component.empty() : hint;
        super.setHint(visualHint);
    }

    @Override
    public void setHighlightPos(int position) {
        super.setHighlightPos(position);
        visualHighlightPos = clamp(position, 0, getValue().length());
    }

    @Override
    public void setFocused(boolean focused) {
        boolean newlyFocused = focused && !isFocused();
        super.setFocused(focused);
        if (newlyFocused) {
            focusedAt = System.currentTimeMillis();
        }
    }

    @Override
    public void extractWidgetRenderState(
            GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        if (!isVisible()) {
            return;
        }

        String value = getValue();
        int cursor = clamp(getCursorPosition(), 0, value.length());
        TextWindow window = textWindow(
                value, cursor, displayStart, availableTextWidth(), this::measure);
        displayStart = window.start();

        int textY = centeredTextY(getY(), getHeight());
        int renderedHeight = TEXT_HEIGHT;
        graphics.enableScissor(getX(), getY(), getRight(), getBottom());

        drawSelection(graphics, value, cursor, window, textY, renderedHeight);
        if (value.isEmpty()) {
            drawText(graphics, visualHint, textY, SkydexTheme.MUTED);
        } else {
            drawText(graphics, SkydexFonts.input(value.substring(window.start(), window.end())),
                    textY, editable ? visualTextColor : visualUneditableColor);
        }

        if (isFocused()
                && TextCursorUtils.isCursorVisible(System.currentTimeMillis() - focusedAt)) {
            int cursorX = getX() + measure(value.substring(window.start(), cursor));
            graphics.fill(cursorX, textY - 1, cursorX + 1, textY + renderedHeight + 1,
                    editable ? visualTextColor : visualUneditableColor);
        }
        graphics.disableScissor();
    }

    private void drawSelection(
            GuiGraphicsExtractor graphics, String value, int cursor,
            TextWindow window, int textY, int renderedHeight) {
        int highlight = clamp(visualHighlightPos, 0, value.length());
        int selectionStart = Math.max(window.start(), Math.min(cursor, highlight));
        int selectionEnd = Math.min(window.end(), Math.max(cursor, highlight));
        if (selectionEnd <= selectionStart) {
            return;
        }
        int left = getX() + measure(value.substring(window.start(), selectionStart));
        int right = getX() + measure(value.substring(window.start(), selectionEnd));
        graphics.fill(left, textY - 1, Math.max(left + 1, right), textY + renderedHeight + 1,
                SkydexTheme.withAlpha(SkydexTheme.ACCENT, 82));
    }

    private void drawText(
            GuiGraphicsExtractor graphics, Component text, int textY, int color) {
        graphics.text(skydexFont, text, getX(), textY, color, false);
    }

    @Override
    public void onClick(MouseButtonEvent event, boolean doubled) {
        int position = clickedPosition(event.x());
        if (!doubled) {
            moveCursorTo(position, event.hasShiftDown());
            return;
        }

        moveCursorTo(position, false);
        int wordStart = getWordPosition(-1);
        int wordEnd = getWordPosition(1);
        moveCursorTo(wordStart, false);
        moveCursorTo(wordEnd, true);
    }

    @Override
    protected void onDrag(MouseButtonEvent event, double dragX, double dragY) {
        moveCursorTo(clickedPosition(event.x()), true);
    }

    @Override
    public int getScreenX(int characterIndex) {
        String value = getValue();
        int cursor = clamp(getCursorPosition(), 0, value.length());
        TextWindow window = textWindow(
                value, cursor, displayStart, availableTextWidth(), this::measure);
        displayStart = window.start();
        int position = clamp(characterIndex, window.start(), window.end());
        return getX() + measure(value.substring(window.start(), position));
    }

    private int clickedPosition(double mouseX) {
        String value = getValue();
        int cursor = clamp(getCursorPosition(), 0, value.length());
        TextWindow window = textWindow(
                value, cursor, displayStart, availableTextWidth(), this::measure);
        displayStart = window.start();
        return hitIndex(value, window, Math.max(0, (int) Math.floor(mouseX) - getX()), this::measure);
    }

    private int measure(String value) {
        if (value.isEmpty()) {
            return 0;
        }
        return Math.max(1, skydexFont.width(SkydexFonts.input(value)));
    }

    private int availableTextWidth() {
        // Reserve one unit for the insertion cursor so a long paste never places it outside
        // the field's scissor rectangle.
        return Math.max(0, getWidth() - 1);
    }

    static int centeredTextY(int y, int height) {
        return y + (height - TEXT_HEIGHT) / 2;
    }

    static TextWindow textWindow(
            String value, int cursor, int currentStart, int available,
            ToIntFunction<String> measure) {
        String safe = value == null ? "" : value;
        int safeCursor = clamp(cursor, 0, safe.length());
        int start = clamp(currentStart, 0, safeCursor);

        if (measure.applyAsInt(safe.substring(start, safeCursor)) > available) {
            int low = start;
            int high = safeCursor;
            while (low < high) {
                int middle = (low + high) >>> 1;
                if (measure.applyAsInt(safe.substring(middle, safeCursor)) <= available) {
                    high = middle;
                } else {
                    low = middle + 1;
                }
            }
            start = low;
        } else {
            while (start > 0
                    && measure.applyAsInt(safe.substring(start - 1, safeCursor)) <= available) {
                start--;
            }
        }

        int end = safeCursor;
        while (end < safe.length()
                && measure.applyAsInt(safe.substring(start, end + 1)) <= available) {
            end++;
        }
        return new TextWindow(start, end);
    }

    static int hitIndex(
            String value, TextWindow window, int x, ToIntFunction<String> measure) {
        int previousWidth = 0;
        for (int index = window.start(); index < window.end(); index++) {
            int nextWidth = measure.applyAsInt(value.substring(window.start(), index + 1));
            if (x < (previousWidth + nextWidth) / 2) {
                return index;
            }
            previousWidth = nextWidth;
        }
        return window.end();
    }

    private static int clamp(int value, int minimum, int maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    record TextWindow(int start, int end) {
    }
}
