package com.skydex.gui;

import com.skydex.SkydexMod;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;

/** Exact type roles used by the accepted Skydex prototype. */
public final class SkydexFonts {

    private static final FontDescription.Resource MONTSERRAT_UI = resource("montserrat_ui");
    private static final FontDescription.Resource MONTSERRAT_BODY = resource("montserrat_body");
    private static final FontDescription.Resource MONTSERRAT_CONTROL = resource("montserrat_control");
    private static final FontDescription.Resource MONTSERRAT_INPUT = resource("montserrat_input");
    private static final FontDescription.Resource MONTSERRAT_LEGEND = resource("montserrat_legend");
    private static final FontDescription.Resource MONTSERRAT_MENU = resource("montserrat_menu");
    private static final FontDescription.Resource MONTSERRAT_MICRO = resource("montserrat_micro");
    private static final FontDescription.Resource MONTSERRAT_LEAD = resource("montserrat_lead");
    private static final FontDescription.Resource MONTSERRAT_META = resource("montserrat_meta");
    private static final FontDescription.Resource MONTSERRAT_META_STRONG =
            resource("montserrat_meta_strong");
    private static final FontDescription.Resource MONTSERRAT_DRAWER = resource("montserrat_drawer");
    private static final FontDescription.Resource SPACE_VERSION = resource("space_grotesk_version");
    private static final FontDescription.Resource SPACE_META = resource("space_grotesk_meta");
    private static final FontDescription.Resource SPACE_META_STRONG =
            resource("space_grotesk_meta_strong");
    private static final FontDescription.Resource SPACE_MICRO = resource("space_grotesk_micro");

    private static final Style UI_STYLE = style(MONTSERRAT_UI);
    private static final Style BODY_STYLE = style(MONTSERRAT_BODY);
    private static final Style CONTROL_STYLE = style(MONTSERRAT_CONTROL);
    private static final Style INPUT_STYLE = style(MONTSERRAT_INPUT);
    private static final Style LEGEND_STYLE = style(MONTSERRAT_LEGEND);
    private static final Style MENU_STYLE = style(MONTSERRAT_MENU);
    private static final Style MICRO_STYLE = style(MONTSERRAT_MICRO);
    private static final Style LEAD_STYLE = style(MONTSERRAT_LEAD);
    private static final Style META_STYLE = style(MONTSERRAT_META);
    private static final Style META_STRONG_STYLE = style(MONTSERRAT_META_STRONG);
    private static final Style DRAWER_STYLE = style(MONTSERRAT_DRAWER);
    private static final Style SPACE_VERSION_STYLE = style(SPACE_VERSION);
    private static final Style SPACE_META_STYLE = style(SPACE_META);
    private static final Style SPACE_META_STRONG_STYLE = style(SPACE_META_STRONG);
    private static final Style SPACE_MICRO_STYLE = style(SPACE_MICRO);

    private SkydexFonts() {
    }

    public static MutableComponent ui(String value) { return text(value, UI_STYLE); }
    public static MutableComponent body(String value) { return text(value, BODY_STYLE); }
    public static MutableComponent control(String value) { return text(value, CONTROL_STYLE); }
    public static MutableComponent input(String value) { return text(value, INPUT_STYLE); }
    public static MutableComponent legend(String value) { return text(value, LEGEND_STYLE); }
    public static MutableComponent menu(String value) { return text(value, MENU_STYLE); }
    public static MutableComponent micro(String value) { return text(value, MICRO_STYLE); }
    public static MutableComponent lead(String value) { return text(value, LEAD_STYLE); }
    public static MutableComponent meta(String value) { return text(value, META_STYLE); }
    public static MutableComponent metaStrong(String value) { return text(value, META_STRONG_STYLE); }
    public static MutableComponent drawer(String value) { return text(value, DRAWER_STYLE); }
    public static MutableComponent space(String value) { return text(value, SPACE_VERSION_STYLE); }
    public static MutableComponent spaceMeta(String value) { return text(value, SPACE_META_STYLE); }
    public static MutableComponent spaceMetaStrong(String value) {
        return text(value, SPACE_META_STRONG_STYLE);
    }
    public static MutableComponent spaceMicro(String value) { return text(value, SPACE_MICRO_STYLE); }

    public static Style uiStyle() { return UI_STYLE; }
    public static Style bodyStyle() { return BODY_STYLE; }
    public static Style controlStyle() { return CONTROL_STYLE; }
    public static Style inputStyle() { return INPUT_STYLE; }
    public static Style metaStyle() { return META_STYLE; }
    public static Style metaStrongStyle() { return META_STRONG_STYLE; }

    public static MutableComponent text(Role role, String value) {
        return switch (role) {
            case UI -> ui(value);
            case BODY -> body(value);
            case CONTROL -> control(value);
            case INPUT -> input(value);
            case LEGEND -> legend(value);
            case MENU -> menu(value);
            case MICRO -> micro(value);
            case LEAD -> lead(value);
            case META -> meta(value);
            case META_STRONG -> metaStrong(value);
            case DRAWER -> drawer(value);
            case SPACE -> space(value);
            case SPACE_META -> spaceMeta(value);
            case SPACE_META_STRONG -> spaceMetaStrong(value);
            case SPACE_MICRO -> spaceMicro(value);
        };
    }

    private static MutableComponent text(String value, Style style) {
        return Component.literal(value == null ? "" : value).withStyle(style);
    }

    private static Style style(FontDescription.Resource font) {
        return Style.EMPTY.withFont(font).withoutShadow();
    }

    private static FontDescription.Resource resource(String path) {
        return new FontDescription.Resource(Identifier.fromNamespaceAndPath(SkydexMod.MOD_ID, path));
    }

    public enum Role {
        UI,
        BODY,
        CONTROL,
        INPUT,
        LEGEND,
        MENU,
        MICRO,
        LEAD,
        META,
        META_STRONG,
        DRAWER,
        SPACE,
        SPACE_META,
        SPACE_META_STRONG,
        SPACE_MICRO
    }
}
