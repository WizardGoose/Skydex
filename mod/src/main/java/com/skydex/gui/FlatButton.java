package com.skydex.gui;

import com.mojang.blaze3d.platform.InputConstants;
import com.skydex.SkydexTheme;
import com.skydex.SkydexMod;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.util.function.BooleanSupplier;

/** The compact controls used by the accepted Skydex screen. */
public final class FlatButton extends AbstractWidget {

    private static final int CONTROL_TEXT_HEIGHT = 15;
    private static final Identifier CHEVRON_RIGHT = icon("preset_chevron_right");
    private static final Identifier CHEVRON_RIGHT_HOVER = icon("preset_chevron_right_hover");
    private static final Identifier CHEVRON_LEFT = icon("preset_chevron_left");
    private static final Identifier CHEVRON_LEFT_HOVER = icon("preset_chevron_left_hover");

    private final Runnable onPress;
    private final BooleanSupplier selected;
    private final Style style;
    private final boolean leftAligned;

    public FlatButton(int x, int y, int width, int height, Component message, Runnable onPress) {
        this(x, y, width, height, message, onPress, () -> false, Style.DEFAULT, false);
    }

    public FlatButton(int x, int y, int width, int height, Component message,
                      Runnable onPress, BooleanSupplier selected) {
        this(x, y, width, height, message, onPress, selected, Style.DEFAULT, false);
    }

    public FlatButton(int x, int y, int width, int height, Component message,
                      Runnable onPress, BooleanSupplier selected, Style style, boolean leftAligned) {
        super(x, y, width, height, message);
        this.onPress = onPress;
        this.selected = selected;
        this.style = style == null ? Style.DEFAULT : style;
        this.leftAligned = leftAligned;
    }

    @Override
    protected void extractWidgetRenderState(
            GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        boolean isSelected = selected.getAsBoolean();
        boolean highlight = isHoveredOrFocused() && active;

        if (style == Style.BARE) {
            drawBare(graphics, highlight);
            return;
        }

        int accent = isSelected && style == Style.PRIMARY
                ? SkydexTheme.SUCCESS : SkydexTheme.ACCENT;
        int fill = style == Style.MENU_CHECKBOX
                ? (highlight ? SkydexTheme.SURFACE_HOVER : 0x00000000)
                : (isSelected && style == Style.PRIMARY) || style == Style.PRIMARY
                ? SkydexTheme.withAlpha(accent, 27)
                : highlight ? SkydexTheme.SURFACE_HOVER : SkydexTheme.SURFACE;
        int border = (isSelected && style == Style.PRIMARY) || style == Style.PRIMARY || highlight
                ? SkydexTheme.withAlpha(accent, highlight ? 210 : 145) : SkydexTheme.BORDER;

        boolean checkbox = style == Style.CHECKBOX || style == Style.MENU_CHECKBOX;
        if (style == Style.CHECKBOX) {
            graphics.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), fill);
            graphics.fill(getX(), getY(), getX() + getWidth(), getY() + 1, border);
            graphics.fill(getX(), getY() + getHeight() - 1,
                    getX() + getWidth(), getY() + getHeight(), border);
        } else if (style == Style.MENU_CHECKBOX) {
            if (fill != 0) {
                graphics.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), fill);
            }
            graphics.fill(getX(), getY() + getHeight() - 1,
                    getX() + getWidth(), getY() + getHeight(), SkydexTheme.BORDER);
        } else {
            fillRounded(graphics, getX(), getY(), getWidth(), getHeight(), 4, fill);
            outlineRounded(graphics, getX(), getY(), getWidth(), getHeight(), 4, border);
        }

        int textX = getX() + 11;
        if (checkbox) {
            boolean compact = style == Style.MENU_CHECKBOX;
            drawCheckbox(graphics, isSelected, compact);
            textX = getX() + (compact ? 20 : 34);
        }
        int textColour = !active ? SkydexTheme.MUTED
                : style == Style.PRIMARY ? 0xFFBCEBFF : 0xFFE0E6ED;
        drawMessage(graphics, textX, textColour, leftAligned || checkbox);
    }

    private void drawBare(GuiGraphicsExtractor graphics, boolean highlight) {
        boolean pointsLeft = selected.getAsBoolean();
        Identifier texture = pointsLeft
                ? (highlight ? CHEVRON_LEFT_HOVER : CHEVRON_LEFT)
                : (highlight ? CHEVRON_RIGHT_HOVER : CHEVRON_RIGHT);
        int x = getX() + (getWidth() - SettingsLayout.CHEVRON_W) / 2;
        int y = getY() + (getHeight() - SettingsLayout.CHEVRON_H) / 2;
        graphics.blit(texture, x, y,
                x + SettingsLayout.CHEVRON_W, y + SettingsLayout.CHEVRON_H,
                0.0f, 1.0f, 0.0f, 1.0f);
    }

    private void drawCheckbox(
            GuiGraphicsExtractor graphics, boolean checked, boolean compact) {
        int size = compact ? 13 : 15;
        int x = getX() + (compact ? 0 : 10);
        int y = getY() + (getHeight() - size) / 2;
        fillRounded(graphics, x, y, size, size, compact ? 2 : 3,
                checked ? SkydexTheme.ACCENT : 0x19000000);
        graphics.outline(x, y, size, size,
                checked ? 0xFF72D5FF : SkydexTheme.withAlpha(SkydexTheme.MUTED, 125));
        if (!checked) {
            return;
        }
        int tick = 0xFFF1FAFF;
        int offset = compact ? 0 : 1;
        graphics.fill(x + 2 + offset, y + 6, x + 5 + offset, y + 9, tick);
        graphics.fill(x + 4 + offset, y + 8, x + 6 + offset, y + 11, tick);
        graphics.fill(x + 6 + offset, y + 4, x + 10 + offset, y + 9, tick);
    }

    private void drawMessage(
            GuiGraphicsExtractor graphics, int leftEdge, int colour, boolean alignLeft) {
        Font font = Minecraft.getInstance().font;
        Component message = getMessage();
        int messageWidth = font.width(message);
        int textX = alignLeft
                ? leftEdge
                : getX() + Math.max(4, (getWidth() - messageWidth) / 2);
        int textY = getY() + (getHeight() - CONTROL_TEXT_HEIGHT) / 2;
        graphics.enableScissor(getX() + 1, getY() + 1,
                getX() + getWidth() - 1, getY() + getHeight() - 1);
        graphics.text(font, message, textX, textY, colour, false);
        graphics.disableScissor();
    }

    /** Four-pixel browser radii represented on the shared prototype grid. */
    private static void fillRounded(
            GuiGraphicsExtractor graphics, int x, int y, int width, int height,
            int radius, int colour) {
        if ((colour >>> 24) == 0) {
            return;
        }
        for (int row = 0; row < height; row++) {
            int edge = Math.min(row, height - 1 - row);
            int inset = roundedInset(edge, radius);
            graphics.fill(x + inset, y + row, x + width - inset, y + row + 1, colour);
        }
    }

    private static void outlineRounded(
            GuiGraphicsExtractor graphics, int x, int y, int width, int height,
            int radius, int colour) {
        for (int row = 0; row < height; row++) {
            int edge = Math.min(row, height - 1 - row);
            int inset = roundedInset(edge, radius);
            if (edge == 0) {
                graphics.fill(x + inset, y + row, x + width - inset, y + row + 1, colour);
            } else {
                graphics.fill(x + inset, y + row, x + inset + 1, y + row + 1, colour);
                graphics.fill(x + width - inset - 1, y + row,
                        x + width - inset, y + row + 1, colour);
            }
        }
    }

    private static int roundedInset(int edge, int radius) {
        if (radius <= 1 || edge >= radius) {
            return 0;
        }
        return switch (radius) {
            case 2 -> edge == 0 ? 1 : 0;
            case 3 -> edge == 0 ? 2 : edge == 1 ? 1 : 0;
            default -> edge == 0 ? 2 : edge == 1 ? 1 : 0;
        };
    }

    @Override
    public void onClick(MouseButtonEvent event, boolean doubled) {
        press();
    }

    @Override
    public boolean keyPressed(KeyEvent event) {
        if (!active || !visible) {
            return false;
        }
        if (event.key() == InputConstants.KEY_RETURN || event.key() == InputConstants.KEY_SPACE) {
            press();
            return true;
        }
        return false;
    }

    private void press() {
        playButtonClickSound(Minecraft.getInstance().getSoundManager());
        onPress.run();
    }

    @Override
    protected void updateWidgetNarration(NarrationElementOutput output) {
        defaultButtonNarrationText(output);
    }

    private static Identifier icon(String name) {
        return Identifier.fromNamespaceAndPath(
                SkydexMod.MOD_ID, "gui/" + name + ".png");
    }

    public enum Style {
        DEFAULT,
        PRIMARY,
        CHECKBOX,
        MENU_CHECKBOX,
        BARE
    }
}
