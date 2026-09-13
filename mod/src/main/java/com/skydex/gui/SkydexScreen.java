package com.skydex.gui;

import com.mojang.blaze3d.platform.InputConstants;
import com.skydex.SkydexTheme;
import com.skydex.SkydexMod;
import com.skydex.data.GreenhouseBoard;
import com.skydex.data.SnapshotStore;
import com.skydex.export.ExportSection;
import com.skydex.garden.GreenhouseCatalog;
import com.skydex.http.SkydexHttpServer;
import com.skydex.layout.GreenhouseLayout;
import com.skydex.layout.LayoutCell;
import com.skydex.layout.LayoutFormatException;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** The accepted compact Skydex Greenhouse screen opened by {@code /skydex}. */
public final class SkydexScreen extends Screen {

    private static final long AUTO_IMPORT_DELAY_MS = 280L;
    private static final long IMPORT_FEEDBACK_MS = 700L;
    private static final long COPY_FEEDBACK_MS = 1_100L;

    private static final int TOPBAR = 0xB8030508;
    private static final int FIELD = 0x9E020508;
    private static final int LINE = 0x24D3DBE5;
    private static final int LINE_SOFT = 0x16D3DBE5;
    private static final int BODY_TEXT = 0xFFC9D2DC;

    private static final Identifier WORDMARK_TEXTURE = guiTexture("skydex_wordmark");

    private final SkydexMod mod;
    private final Map<ExportSection, FlatButton> dataOptions = new EnumMap<>(ExportSection.class);

    private SkydexEditBox shareInput;
    private FlatButton presetButton;
    private FlatButton helperButton;
    private FlatButton dataButton;
    private FlatButton copyButton;

    private boolean presetOpen;
    private boolean dataOpen;
    private double presetFrom;
    private double presetProgress;
    private long presetStartedAt;

    private long shareChangedAt;
    private String pendingShare = "";
    private String lastAttemptedShare = "";
    private long importedUntil;
    private long copiedUntil;
    private boolean copyFailed;
    private String importError;

    public SkydexScreen(SkydexMod mod) {
        super(Component.literal("Skydex"));
        this.mod = mod;
    }

    @Override
    protected void init() {
        SettingsLayout layout = SettingsLayout.of(width, height);
        String previousInput = shareInput == null ? "" : shareInput.getValue();
        dataOptions.clear();

        presetButton = addRenderableWidget(new FlatButton(
                layout.arrowX(), layout.arrowY(), SettingsLayout.ARROW_W, SettingsLayout.ARROW_H,
                SkydexFonts.control(presetOpen ? "Close presets" : "Open presets"), this::togglePresetRail,
                () -> presetOpen, FlatButton.Style.BARE, false));

        shareInput = addRenderableWidget(new SkydexEditBox(
                font, layout.shareX() + SettingsLayout.SHARE_TEXT_PADDING, layout.shareY(),
                layout.shareWidth() - SettingsLayout.SHARE_TEXT_PADDING * 2,
                SettingsLayout.SHARE_H,
                Component.literal("Greenhouse share code")));
        shareInput.setTextColor(BODY_TEXT);
        shareInput.setTextColorUneditable(SkydexTheme.MUTED);
        shareInput.setMaxLength(GreenhouseShareCodeLimits.MAX_INPUT);
        shareInput.setHint(Component.literal("Paste a Skydex Greenhouse share code or link")
                .withStyle(SkydexFonts.inputStyle().withColor(SkydexTheme.rgb(0xFF68778B))));
        shareInput.setValue(previousInput);
        shareInput.setResponder(this::shareChanged);

        helperButton = addRenderableWidget(new FlatButton(
                layout.rightX(), layout.helperY(), layout.rightWidth(), SettingsLayout.HELPER_H,
                SkydexFonts.control("Placement helper"), this::toggleHelper,
                mod::placementHelperEnabled, FlatButton.Style.CHECKBOX, true));

        dataButton = addRenderableWidget(new FlatButton(
                layout.rightX(), layout.exportY(), layout.dataWidth(), SettingsLayout.EXPORT_H,
                SkydexFonts.control("Included data"), this::toggleDataMenu,
                () -> dataOpen, FlatButton.Style.DEFAULT, true));

        copyButton = addRenderableWidget(new FlatButton(
                layout.exportX(), layout.exportY(), SettingsLayout.EXPORT_W, SettingsLayout.EXPORT_H,
                SkydexFonts.control("Copy export code"), this::copyExport));

        int index = 0;
        for (ExportSection section : ExportSection.values()) {
            int column = index % 2;
            int row = index / 2;
            FlatButton option = addRenderableWidget(new FlatButton(
                    layout.dataOptionX(column), layout.dataOptionY(row),
                    layout.dataOptionWidth(), SettingsLayout.DATA_OPTION_H,
                    SkydexFonts.menu(section.label()),
                    () -> toggleExportSection(section),
                    () -> mod.config().isExportSectionEnabled(section),
                    FlatButton.Style.MENU_CHECKBOX, true));
            dataOptions.put(section, option);
            index++;
        }
        refreshWidgets();
    }

    // --------------------------------------------------------------- actions

    private void togglePresetRail() {
        setPresetOpen(!presetOpen);
    }

    private void setPresetOpen(boolean open) {
        long now = System.currentTimeMillis();
        presetProgress = currentPresetProgress(now);
        presetFrom = presetProgress;
        presetStartedAt = now;
        presetOpen = open;
        if (presetButton != null) {
            presetButton.setMessage(SkydexFonts.control(open ? "Close presets" : "Open presets"));
        }
    }

    private void toggleDataMenu() {
        dataOpen = !dataOpen;
    }

    private void toggleExportSection(ExportSection section) {
        mod.setExportSectionEnabled(section, !mod.config().isExportSectionEnabled(section));
    }

    private void shareChanged(String value) {
        importError = null;
        shareInput.setTextColor(BODY_TEXT);
        pendingShare = value == null ? "" : value.trim();
        shareChangedAt = System.currentTimeMillis();
    }

    private void importPendingShare() {
        String value = pendingShare;
        if (value.length() < 8 || value.equals(lastAttemptedShare)) {
            return;
        }
        lastAttemptedShare = value;
        try {
            mod.importLayoutCode(value);
            importError = null;
            shareInput.setTextColor(BODY_TEXT);
            importedUntil = System.currentTimeMillis() + IMPORT_FEEDBACK_MS;
        } catch (LayoutFormatException invalid) {
            importError = invalid.getMessage();
            shareInput.setTextColor(SkydexTheme.DANGER);
        }
    }

    private void toggleHelper() {
        if (mod.layouts().hasLayout()) {
            mod.setPlacementHelperEnabled(!mod.placementHelperEnabled());
        }
    }

    private void copyExport() {
        String summary = mod.copyExportCode();
        copyFailed = summary == null;
        copiedUntil = System.currentTimeMillis() + COPY_FEEDBACK_MS;
    }

    @Override
    public void tick() {
        super.tick();
        if (!pendingShare.isEmpty()
                && System.currentTimeMillis() - shareChangedAt >= AUTO_IMPORT_DELAY_MS) {
            importPendingShare();
        }
    }

    // --------------------------------------------------------------- drawing

    @Override
    public void extractBackground(
            GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        if (minecraft.options.getMenuBackgroundBlurriness() >= 1) {
            graphics.blurBeforeThisStratum();
        }
        graphics.fill(0, 0, width, height, SkydexTheme.SCRIM);
        extractDeferredSubtitles();
    }

    @Override
    public void extractRenderState(
            GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
        SettingsLayout layout = SettingsLayout.of(width, height);
        GreenhouseScreenModel model = currentModel();
        double rail = currentPresetProgress(System.currentTimeMillis());
        int virtualMouseX = (int) Math.floor(layout.virtualX(mouseX));
        int virtualMouseY = (int) Math.floor(layout.virtualY(mouseY));

        graphics.pose().pushMatrix();
        graphics.pose().translate(layout.screenX, layout.screenY);
        graphics.pose().scale(SettingsLayout.RENDER_SCALE);
        try {
            drawPresetRail(graphics, layout, model, rail);
            drawShell(graphics, layout);
            drawHeader(graphics, layout);
            drawBoard(graphics, layout, model);
            drawCurrentPlot(graphics, layout, model);
            drawReplacement(graphics, layout, model);

            refreshWidgets();
            super.extractRenderState(graphics, virtualMouseX, virtualMouseY, partialTick);
            drawDataButtonMeta(graphics, layout);
            drawFloatingDataMenu(graphics, layout, virtualMouseX, virtualMouseY, partialTick);
            drawTooltips(graphics, layout, virtualMouseX, virtualMouseY);
        } finally {
            graphics.pose().popMatrix();
        }
    }

    private void drawShell(GuiGraphicsExtractor graphics, SettingsLayout layout) {
        boolean roundRight = !presetOpen;
        fillRounded(graphics, layout.panelX, layout.panelY,
                SettingsLayout.PANEL_W, SettingsLayout.PANEL_H, 6,
                true, roundRight, 0xF90A0D12);
        fillTopRounded(graphics, layout.panelX + 1, layout.panelY + 1,
                SettingsLayout.PANEL_W - 2, SettingsLayout.TOPBAR_H,
                5, true, roundRight, TOPBAR);
        graphics.fill(layout.panelX + 1, layout.panelY + SettingsLayout.TOPBAR_H,
                layout.panelRight() - 1, layout.panelY + SettingsLayout.TOPBAR_H + 1, LINE);
        outlineRounded(graphics, layout.panelX, layout.panelY,
                SettingsLayout.PANEL_W, SettingsLayout.PANEL_H, 6,
                true, roundRight, SkydexTheme.withAlpha(SkydexTheme.TEXT, 43));

        boolean shareActive = importError == null && shareInput != null
                && (shareInput.isFocused() || System.currentTimeMillis() < importedUntil);
        int shareBorder = importError != null ? SkydexTheme.DANGER
                : shareActive ? SkydexTheme.withAlpha(SkydexTheme.ACCENT, 190) : LINE;
        graphics.fill(layout.shareX(), layout.shareY(),
                layout.shareX() + layout.shareWidth(), layout.shareY() + SettingsLayout.SHARE_H,
                FIELD);
        graphics.outline(layout.shareX(), layout.shareY(),
                layout.shareWidth(), SettingsLayout.SHARE_H, shareBorder);
        if (shareActive) {
            graphics.fill(layout.shareX() + 1, layout.shareY() + 1,
                    layout.shareX() + 3, layout.shareY() + SettingsLayout.SHARE_H - 1,
                    SkydexTheme.ACCENT);
        }

        graphics.fill(layout.dividerX(), layout.workspaceY(),
                layout.dividerX() + 1, 373, LINE);
    }

    private void drawHeader(GuiGraphicsExtractor graphics, SettingsLayout layout) {
        blit(graphics, WORDMARK_TEXTURE, layout.wordmarkX(), layout.wordmarkY(),
                SettingsLayout.WORDMARK_W, SettingsLayout.WORDMARK_H);
        int separatorX = layout.brandRuleX();
        graphics.fill(separatorX, 16, separatorX + 1, 33,
                SkydexTheme.withAlpha(SkydexTheme.TEXT, 46));
        drawText(graphics, SkydexFonts.space(displayVersion()), separatorX + 8,
                17, SkydexTheme.MUTED);

        Connection connection = connection();
        int labelWidth = trackedWidth(connection.visible(), SkydexFonts.Role.META_STRONG, 1);
        int labelX = layout.connectionRight() - labelWidth;
        int dotX = labelX - 8;
        int dotY = 21;
        int dot = connection.connected() ? SkydexTheme.ACCENT : SkydexTheme.MUTED;
        drawConnectionDot(graphics, dotX, dotY, dot, connection.connected());
        drawTrackedText(graphics, connection.visible(), SkydexFonts.Role.META_STRONG,
                labelX, 18,
                connection.connected() ? 0xFF8995A6 : SkydexTheme.MUTED);
    }

    private void drawBoard(
            GuiGraphicsExtractor graphics, SettingsLayout layout, GreenhouseScreenModel model) {
        String label = mod.layouts().hasLayout() ? mod.layouts().label() : "No layout loaded";
        drawTrackedText(graphics, "PLOT", SkydexFonts.Role.MICRO, layout.fieldX(),
                layout.workspaceY(), 0xFF91A4B9);
        String progress = layoutProgress(model);
        Component progressText = SkydexFonts.meta(progress);
        int progressX = layout.fieldX() + SettingsLayout.PLOT_COLUMN_W - font.width(progressText);
        int labelWidth = Math.max(20, progressX - layout.fieldX() - 8);
        drawText(graphics,
                SkydexFonts.ui(ellipsise(label, labelWidth, SkydexFonts.Role.UI)),
                layout.fieldX(), 119, 0xFFE8EDF3);
        drawText(graphics, progressText, progressX, 107,
                SkydexTheme.MUTED);

        graphics.fill(layout.boardX(), layout.boardY(),
                layout.boardX() + SettingsLayout.BOARD_SIZE,
                layout.boardY() + SettingsLayout.BOARD_SIZE, 0xB304070A);
        graphics.outline(layout.boardX(), layout.boardY(),
                SettingsLayout.BOARD_SIZE, SettingsLayout.BOARD_SIZE,
                SkydexTheme.withAlpha(SkydexTheme.TEXT, 36));

        for (GreenhouseScreenModel.Cell cell : model.cells()) {
            int x = layout.boardCellX(cell.x());
            int y = layout.boardCellY(cell.y());
            drawCell(graphics, x, y,
                    layout.boardCellSize(cell.x()), layout.boardCellSize(cell.y()), cell);
        }
        drawLegend(graphics, layout);
    }

    private void drawCell(
            GuiGraphicsExtractor graphics, int x, int y, int width, int height,
            GreenhouseScreenModel.Cell cell) {
        String ground = cell.ground();
        if (ground == null) {
            graphics.fill(x, y, x + width, y + height, 0xFF121820);
        } else {
            blit(graphics, texture("ground/" + ground), x, y, width, height);
            graphics.fill(x, y, x + width, y + height, 0x2E030609);
        }

        if (cell.plantId() != null) {
            String cropId = GreenhouseCatalog.textureId(cell.plantId());
            if (cropId != null) {
                blit(graphics, texture("crops/" + cropId), x + 1, y + 1,
                        width - 2, height - 2);
            }
            if (cell.state() == GreenhouseScreenModel.State.PENDING_CROP
                    || cell.state() == GreenhouseScreenModel.State.PENDING_MUTATION) {
                graphics.fill(x + 1, y + 1, x + width - 1, y + height - 1, 0x7204070A);
            }
        }

        int border = switch (cell.state()) {
            case CORRECT -> SkydexTheme.SUCCESS;
            case PENDING_CROP -> SkydexTheme.ACCENT;
            case PENDING_MUTATION -> SkydexTheme.GOLD;
            case REPLACE -> SkydexTheme.DANGER;
            default -> 0x1F93A3B8;
        };
        graphics.outline(x, y, width, height, border);
        int innerBorder = switch (cell.state()) {
            case CORRECT -> SkydexTheme.withAlpha(SkydexTheme.SUCCESS, 61);
            case PENDING_CROP -> SkydexTheme.withAlpha(SkydexTheme.ACCENT, 56);
            case PENDING_MUTATION -> SkydexTheme.withAlpha(SkydexTheme.GOLD, 56);
            case REPLACE -> SkydexTheme.withAlpha(SkydexTheme.DANGER, 61);
            default -> 0;
        };
        if (innerBorder != 0 && width >= 4 && height >= 4) {
            graphics.outline(x + 1, y + 1, width - 2, height - 2, innerBorder);
        }
    }

    /** The six-pixel CSS status dot and its restrained radial glow. */
    private static void drawConnectionDot(
            GuiGraphicsExtractor graphics, int x, int y, int colour, boolean glowing) {
        if (glowing) {
            graphics.fill(x - 2, y, x + 8, y + 6, SkydexTheme.withAlpha(colour, 15));
            graphics.fill(x, y - 2, x + 6, y + 8, SkydexTheme.withAlpha(colour, 15));
            graphics.fill(x - 1, y - 1, x + 7, y + 7,
                    SkydexTheme.withAlpha(colour, 24));
        }
        graphics.fill(x + 1, y, x + 5, y + 1, colour);
        graphics.fill(x, y + 1, x + 6, y + 5, colour);
        graphics.fill(x + 1, y + 5, x + 5, y + 6, colour);
    }

    private void drawLegend(GuiGraphicsExtractor graphics, SettingsLayout layout) {
        String[] labels = {"Right", "Place", "Mutation", "Replace"};
        int[] colours = {
                SkydexTheme.SUCCESS, SkydexTheme.ACCENT, SkydexTheme.GOLD, SkydexTheme.DANGER};
        int x = layout.fieldX();
        for (int i = 0; i < labels.length; i++) {
            int keyY = layout.legendY() + 8;
            graphics.fill(x, keyY, x + 7, keyY + 7, colours[i]);
            graphics.fill(x + 2, keyY + 2, x + 5, keyY + 5, 0xFF0A0D12);
            x += 11;
            Component label = SkydexFonts.legend(labels[i]);
            drawText(graphics, label, x, layout.legendY() + 5, SkydexTheme.MUTED);
            x += font.width(label) + 10;
        }
    }

    private void drawCurrentPlot(
            GuiGraphicsExtractor graphics, SettingsLayout layout, GreenhouseScreenModel model) {
        LayoutBrief brief = layoutBrief();
        int x = layout.rightX();
        int leadY = layout.currentLeadY();

        drawTrackedText(graphics, "CURRENT PLOT", SkydexFonts.Role.MICRO,
                x, leadY + 1, 0xFF91A4B9);
        drawText(graphics,
                SkydexFonts.lead(ellipsise(brief.goal(), layout.rightWidth(),
                        SkydexFonts.Role.LEAD)),
                x, leadY + 14, 0xFFEEF7FB);

        Component detail = brief.cellCount() == 0
                ? SkydexFonts.meta("Paste a Skydex share link above")
                : SkydexFonts.metaStrong(brief.cellCount() + " cells")
                .withStyle(SkydexFonts.metaStrongStyle().withColor(0xFFA5E2FF))
                .append(SkydexFonts.meta(" · imported from Skydex")
                        .withStyle(SkydexFonts.metaStyle().withColor(SkydexTheme.MUTED)));
        drawText(graphics, detail, x, leadY + 38, SkydexTheme.MUTED);

        int briefY = layout.briefY();
        graphics.fill(x, briefY, layout.contentRight(), briefY + 1, LINE_SOFT);
        graphics.fill(x, briefY + SettingsLayout.BRIEF_H - 1,
                layout.contentRight(), briefY + SettingsLayout.BRIEF_H, LINE_SOFT);
        graphics.fill(layout.briefSplitX(), briefY + 1,
                layout.briefSplitX() + 1, briefY + SettingsLayout.BRIEF_H - 1,
                SkydexTheme.withAlpha(SkydexTheme.TEXT, 22));

        drawBriefGroup(graphics, "TARGET MUTATIONS", brief.targets(),
                x, layout.briefSplitX() - x - 7, briefY);
        drawBriefGroup(graphics, "INPUT CROPS", brief.inputs(),
                layout.briefSplitX() + 8,
                layout.contentRight() - layout.briefSplitX() - 8, briefY);
    }

    private void drawBriefGroup(
            GuiGraphicsExtractor graphics, String heading, List<BriefItem> items,
            int x, int width, int y) {
        drawTrackedText(graphics, heading, SkydexFonts.Role.MICRO,
                x, y + 9, SkydexTheme.MUTED);
        int total = items.stream().mapToInt(BriefItem::count).sum();
        String count = Integer.toString(total);
        int countWidth = trackedWidth(count, SkydexFonts.Role.SPACE_MICRO, 1);
        drawTrackedText(graphics, count, SkydexFonts.Role.SPACE_MICRO,
                x + width - countWidth, y + 9, 0xFFB2BFCE);

        if (items.isEmpty()) {
            drawText(graphics, SkydexFonts.body("None"), x, y + 31, 0xFF68778B);
            return;
        }

        int shown = Math.min(2, items.size());
        int slotWidth = width / shown;
        for (int index = 0; index < shown; index++) {
            BriefItem item = items.get(index);
            int itemX = x + index * slotWidth;
            drawCrop(graphics, item.id(), itemX, y + 30, SettingsLayout.BRIEF_ICON);
            int textX = itemX + SettingsLayout.BRIEF_ICON + 5;
            int available = Math.max(8, slotWidth - SettingsLayout.BRIEF_ICON - 7);
            drawText(graphics,
                    SkydexFonts.body(ellipsise(item.name(), available, SkydexFonts.Role.BODY)),
                    textX, y + 28, 0xFFD3DDE5);
            drawText(graphics, SkydexFonts.spaceMeta("×" + item.count()),
                    textX, y + 45, 0xFF7890A3);
        }
    }

    private void drawReplacement(
            GuiGraphicsExtractor graphics, SettingsLayout layout, GreenhouseScreenModel model) {
        if (model.replacements().isEmpty()) {
            return;
        }
        GreenhouseScreenModel.Replacement replacement = model.replacements().get(0);
        int x = layout.rightX();
        int y = layout.replacementY();
        int right = layout.contentRight();
        graphics.fill(x, y, right, y + SettingsLayout.REPLACEMENT_H,
                SkydexTheme.withAlpha(SkydexTheme.DANGER, 14));
        graphics.fill(x, y, x + 2, y + SettingsLayout.REPLACEMENT_H, SkydexTheme.DANGER);
        String replaceLabel = "REPLACE";
        drawTrackedText(graphics, replaceLabel, SkydexFonts.Role.MICRO,
                x + 9, y + 9, 0xFFFF9DA4);

        int flowX = x + 9 + trackedWidth(replaceLabel, SkydexFonts.Role.MICRO, 1) + 7;
        drawCrop(graphics, replacement.actualId(), flowX, y + 6, 21);
        flowX += 28;
        String actual = ellipsise(replacement.actualName(), 65, SkydexFonts.Role.META_STRONG);
        Component actualText = SkydexFonts.metaStrong(actual);
        drawText(graphics, actualText, flowX, y + 10, 0xFFD6DDE5);
        flowX += font.width(actualText) + 7;
        Component arrow = SkydexFonts.metaStrong("→");
        drawText(graphics, arrow, flowX, y + 10, 0xFF758293);
        flowX += font.width(arrow) + 7;
        drawCrop(graphics, replacement.targetId(), flowX, y + 6, 21);
        flowX += 28;
        String target = ellipsise(
                replacement.targetName(), right - flowX - 9, SkydexFonts.Role.META_STRONG);
        drawText(graphics, SkydexFonts.metaStrong(target), flowX, y + 10, 0xFFD6DDE5);
    }

    private void drawPresetRail(
            GuiGraphicsExtractor graphics, SettingsLayout layout,
            GreenhouseScreenModel model, double progress) {
        if (progress <= 0.001
                || layout.screenX + SettingsLayout.rendered(SettingsLayout.PANEL_W) >= width) {
            return;
        }
        int virtualScreenRight = (int) Math.floor(layout.virtualX(width));
        int visibleRight = Math.min(
                virtualScreenRight, layout.panelRight() + SettingsLayout.DRAWER_W);
        graphics.enableScissor(layout.panelRight(), layout.panelY, visibleRight, layout.panelBottom());
        int x = layout.drawerX(progress);
        fillRounded(graphics, x, layout.panelY,
                SettingsLayout.DRAWER_W, SettingsLayout.PANEL_H, 6,
                false, true, 0xFF090D12);
        fillTopRounded(graphics, x, layout.panelY + 1,
                SettingsLayout.DRAWER_W - 1, SettingsLayout.TOPBAR_H - 1,
                5, false, true, TOPBAR);
        graphics.fill(x, layout.panelY + SettingsLayout.TOPBAR_H,
                x + SettingsLayout.DRAWER_W - 1,
                layout.panelY + SettingsLayout.TOPBAR_H + 1, LINE);
        outlineRounded(graphics, x, layout.panelY,
                SettingsLayout.DRAWER_W, SettingsLayout.PANEL_H, 6,
                false, true, SkydexTheme.withAlpha(SkydexTheme.TEXT, 43));

        drawText(graphics, SkydexFonts.drawer("Loadouts"), x + 14,
                17, 0xFFE8EDF3);
        String savedLabel = mod.layouts().hasLayout() ? "1 saved" : "0 saved";
        Component saved = SkydexFonts.spaceMetaStrong(savedLabel);
        drawText(graphics, saved, x + SettingsLayout.DRAWER_W - 14 - font.width(saved),
                18, 0xFFA5E2FF);

        if (mod.layouts().hasLayout()) {
            drawPresetCard(graphics, layout, model, progress);
        }
        graphics.disableScissor();
    }

    private void drawPresetCard(
            GuiGraphicsExtractor graphics, SettingsLayout layout,
            GreenhouseScreenModel model, double progress) {
        int x = layout.drawerCardX(progress);
        int y = layout.drawerCardY(0);
        int cardWidth = layout.drawerCardWidth();
        graphics.fill(x, y, x + cardWidth, y + SettingsLayout.PRESET_CARD_H,
                SkydexTheme.withAlpha(SkydexTheme.ACCENT, 14));
        graphics.fill(x, y, x + 2, y + SettingsLayout.PRESET_CARD_H, SkydexTheme.ACCENT);
        graphics.fill(x, y + SettingsLayout.PRESET_CARD_H - 1,
                x + cardWidth, y + SettingsLayout.PRESET_CARD_H, LINE_SOFT);

        int previewX = x + 5;
        int previewY = y + (SettingsLayout.PRESET_CARD_H - SettingsLayout.PRESET_PREVIEW_SIZE) / 2;
        graphics.fill(previewX, previewY,
                previewX + SettingsLayout.PRESET_PREVIEW_SIZE,
                previewY + SettingsLayout.PRESET_PREVIEW_SIZE, 0xAD030609);
        graphics.outline(previewX, previewY,
                SettingsLayout.PRESET_PREVIEW_SIZE, SettingsLayout.PRESET_PREVIEW_SIZE, LINE);
        Map<Integer, GreenhouseScreenModel.Cell> previewCells = presetPreviewCells(model);
        for (int slot = 0; slot < SettingsLayout.PRESET_GRID_SIZE
                * SettingsLayout.PRESET_GRID_SIZE; slot++) {
            int column = slot % SettingsLayout.PRESET_GRID_SIZE;
            int row = slot / SettingsLayout.PRESET_GRID_SIZE;
            int cellX = layout.presetCellX(x, column);
            int cellY = layout.presetCellY(y, row);
            GreenhouseScreenModel.Cell source = previewCells.get(slot);
            GreenhouseScreenModel.Cell cell = source == null
                    ? new GreenhouseScreenModel.Cell(column, row, null, "farmland",
                    GreenhouseScreenModel.State.EMPTY)
                    : new GreenhouseScreenModel.Cell(column, row, source.plantId(), source.ground(),
                    GreenhouseScreenModel.State.EMPTY);
            drawCell(graphics, cellX, cellY,
                    layout.presetCellSize(column), layout.presetCellSize(row), cell);
        }

        int textX = x + 85;
        int textWidth = x + cardWidth - textX - 5;
        String name = ellipsise(mod.layouts().label(), textWidth, SkydexFonts.Role.BODY);
        drawText(graphics, SkydexFonts.body(name), textX, y + 31, 0xFFDCE2E9);
        drawText(graphics,
                SkydexFonts.meta(ellipsise(layoutBrief().drawerGoal(), textWidth,
                        SkydexFonts.Role.META)),
                textX, y + 51, SkydexTheme.MUTED);
    }

    private Map<Integer, GreenhouseScreenModel.Cell> presetPreviewCells(
            GreenhouseScreenModel model) {
        Map<Integer, GreenhouseScreenModel.Cell> preview = new LinkedHashMap<>();
        int order = 0;
        for (GreenhouseScreenModel.Cell cell : model.cells()) {
            if (cell.plantId() == null) {
                continue;
            }
            int slot = (cell.y() % SettingsLayout.PRESET_GRID_SIZE)
                    * SettingsLayout.PRESET_GRID_SIZE
                    + (cell.x() % SettingsLayout.PRESET_GRID_SIZE);
            if (order > 7) {
                slot += SettingsLayout.PRESET_GRID_SIZE;
            }
            if (slot < SettingsLayout.PRESET_GRID_SIZE * SettingsLayout.PRESET_GRID_SIZE) {
                preview.put(slot, cell);
            }
            if (++order == 10) {
                break;
            }
        }
        return preview;
    }

    private void drawDataButtonMeta(GuiGraphicsExtractor graphics, SettingsLayout layout) {
        String value = mod.config().exportSections().size() + " selected";
        Component text = SkydexFonts.spaceMetaStrong(value);
        int x = layout.rightX() + layout.dataWidth() - 8 - font.width(text);
        drawText(graphics, text, x, layout.exportY() + 10, 0xFFA5E2FF);
    }

    private void drawFloatingDataMenu(
            GuiGraphicsExtractor graphics, SettingsLayout layout,
            int mouseX, int mouseY, float partialTick) {
        if (!dataOpen) {
            return;
        }
        graphics.nextStratum();
        graphics.fill(layout.dataMenuX(), layout.dataMenuY(),
                layout.dataMenuX() + layout.dataMenuWidth(),
                layout.dataMenuY() + layout.dataMenuHeight(), 0xFF0B0F15);
        graphics.outline(layout.dataMenuX(), layout.dataMenuY(),
                layout.dataMenuWidth(), layout.dataMenuHeight(),
                SkydexTheme.withAlpha(SkydexTheme.TEXT, 46));
        for (FlatButton option : dataOptions.values()) {
            option.extractRenderState(graphics, mouseX, mouseY, partialTick);
        }
    }

    private void drawTooltips(
            GuiGraphicsExtractor graphics, SettingsLayout layout, int mouseX, int mouseY) {
        if (importError != null && inside(mouseX, mouseY, layout.shareX(), layout.shareY(),
                layout.shareWidth(), SettingsLayout.SHARE_H)) {
            graphics.setTooltipForNextFrame(SkydexFonts.control(importError), mouseX, mouseY);
            return;
        }
    }

    // --------------------------------------------------------------- state

    private void refreshWidgets() {
        if (presetButton == null) {
            return;
        }
        boolean hasLayout = mod.layouts().hasLayout();
        presetButton.active = true;
        presetButton.setMessage(SkydexFonts.control(presetOpen ? "Close presets" : "Open presets"));

        helperButton.active = hasLayout;
        dataButton.setMessage(SkydexFonts.control("Included data"));

        for (Map.Entry<ExportSection, FlatButton> entry : dataOptions.entrySet()) {
            FlatButton option = entry.getValue();
            option.visible = dataOpen;
            option.active = dataOpen;
            option.setMessage(SkydexFonts.menu(entry.getKey().label()));
        }

        long now = System.currentTimeMillis();
        copyButton.setMessage(SkydexFonts.control(now < copiedUntil
                ? (copyFailed ? "Nothing captured" : "Copied") : "Copy export code"));
    }

    private double currentPresetProgress(long now) {
        double target = presetOpen ? 1.0 : 0.0;
        if (presetStartedAt == 0L) {
            presetProgress = target;
            return presetProgress;
        }
        presetProgress = PresetSlide.value(presetFrom, target, now - presetStartedAt);
        return presetProgress;
    }

    private LayoutBrief layoutBrief() {
        GreenhouseLayout layout = mod.layouts().layout();
        if (layout == null) {
            return new LayoutBrief("Import a layout", "No saved loadout", 0,
                    List.of(), List.of());
        }

        String targetId = null;
        for (LayoutCell cell : layout.cells()) {
            if (cell.isMutation()) {
                targetId = GreenhouseCatalog.canonicalId(cell.mutation());
            }
        }
        if (targetId == null) {
            for (LayoutCell cell : layout.cells()) {
                targetId = GreenhouseCatalog.canonicalId(cell.displayName());
            }
        }

        int targetCount = 0;
        if (targetId != null) {
            for (LayoutCell cell : layout.cells()) {
                if (targetId.equals(GreenhouseCatalog.canonicalId(cell.displayName()))) {
                    targetCount++;
                }
            }
        }
        targetCount = Math.max(1, targetCount);

        String targetName = targetId == null ? "layout" : GreenhouseCatalog.displayName(targetId);
        String verb = layout.cells().stream().anyMatch(LayoutCell::isMutation) ? "Grow " : "Plant ";
        String goal = verb + targetCount + " " + targetName;

        List<BriefItem> targets = targetId == null
                ? List.of() : List.of(new BriefItem(targetId, targetName, targetCount));
        Map<String, Integer> inputCounts = new LinkedHashMap<>();
        if (targetId != null) {
            for (GreenhouseCatalog.Requirement requirement
                    : GreenhouseCatalog.requirements(targetId)) {
                inputCounts.merge(requirement.cropId(), requirement.count() * targetCount,
                        Integer::sum);
            }
        }
        List<BriefItem> inputs = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : inputCounts.entrySet()) {
            inputs.add(new BriefItem(entry.getKey(), GreenhouseCatalog.displayName(entry.getKey()),
                    entry.getValue()));
        }
        String drawerGoal = goal.startsWith("Grow ") ? goal.substring(5)
                : goal.startsWith("Plant ") ? goal.substring(6) : goal;
        return new LayoutBrief(goal, drawerGoal, layout.cellCount(), targets, List.copyOf(inputs));
    }

    private String layoutProgress(GreenhouseScreenModel model) {
        GreenhouseLayout layout = mod.layouts().layout();
        if (layout == null || layout.cellCount() == 0) {
            return "0 / 0";
        }
        int complete = Math.max(0,
                layout.cellCount() - model.leftToPlace() - model.mismatches());
        return complete + " / " + layout.cellCount();
    }

    private GreenhouseScreenModel currentModel() {
        return GreenhouseScreenModel.build(mod.layouts().layout(), activeBoard());
    }

    private GreenhouseBoard activeBoard() {
        return mod.greenhouse().currentBoard(net.minecraft.client.Minecraft.getInstance());
    }

    private Connection connection() {
        SkydexHttpServer server = mod.httpServer();
        if (server == null || !server.isRunning()) {
            return new Connection(false, "WEBSITE: DISCONNECTED", "Waiting for the Skydex website");
        }
        String source = server.connectionLabel();
        if (source == null) {
            return new Connection(false, "WEBSITE: DISCONNECTED", "Waiting for the Skydex website");
        }
        return new Connection(true, "WEBSITE: " + source.toUpperCase(Locale.ROOT), "Website connected to " + source);
    }

    private String displayVersion() {
        String version = mod.modVersion();
        int build = version.indexOf('+');
        return build < 0 ? version : version.substring(0, build);
    }

    private String ellipsise(String value, int width, SkydexFonts.Role role) {
        String text = value == null ? "" : value;
        if (width <= 0) {
            return "";
        }
        if (textWidth(text, role) <= width) {
            return text;
        }
        String suffix = "…";
        if (textWidth(suffix, role) > width) {
            return "";
        }
        int end = text.length();
        while (end > 0) {
            String candidate = text.substring(0, --end) + suffix;
            if (textWidth(candidate, role) <= width) {
                return candidate;
            }
        }
        return suffix;
    }

    private int textWidth(String value, SkydexFonts.Role role) {
        return font.width(SkydexFonts.text(role, value));
    }

    private static void drawFlowArrow(
            GuiGraphicsExtractor graphics, int x, int centerY, int width, int colour) {
        int right = x + Math.max(4, width);
        graphics.fill(x, centerY, right, centerY + 1, colour);
        graphics.fill(right - 3, centerY - 2, right - 2, centerY - 1, colour);
        graphics.fill(right - 2, centerY - 1, right - 1, centerY, colour);
        graphics.fill(right - 2, centerY + 1, right - 1, centerY + 2, colour);
        graphics.fill(right - 3, centerY + 2, right - 2, centerY + 3, colour);
    }

    private void drawCrop(
            GuiGraphicsExtractor graphics, String id, int x, int y, int size) {
        String cropId = GreenhouseCatalog.textureId(id);
        if (cropId != null) {
            blit(graphics, texture("crops/" + cropId), x, y, size, size);
        }
    }

    private void drawText(
            GuiGraphicsExtractor graphics, Component text, int x, int y, int colour) {
        graphics.text(font, text, x, y, colour, false);
    }

    /** CSS letter-spacing for the prototype's compact uppercase labels. */
    private void drawTrackedText(
            GuiGraphicsExtractor graphics, String value, SkydexFonts.Role role,
            int x, int y, int colour) {
        int cursor = x;
        for (int offset = 0; offset < value.length();) {
            int codePoint = value.codePointAt(offset);
            String glyph = new String(Character.toChars(codePoint));
            Component component = SkydexFonts.text(role, glyph);
            graphics.text(font, component, cursor, y, colour, false);
            cursor += font.width(component) + 1;
            offset += Character.charCount(codePoint);
        }
    }

    private int trackedWidth(String value, SkydexFonts.Role role, int tracking) {
        int width = 0;
        int glyphs = 0;
        for (int offset = 0; offset < value.length();) {
            int codePoint = value.codePointAt(offset);
            Component component = SkydexFonts.text(
                    role, new String(Character.toChars(codePoint)));
            width += font.width(component);
            glyphs++;
            offset += Character.charCount(codePoint);
        }
        return width + Math.max(0, glyphs - 1) * tracking;
    }

    private static void fillRounded(
            GuiGraphicsExtractor graphics, int x, int y, int width, int height, int radius,
            boolean roundLeft, boolean roundRight, int colour) {
        for (int row = 0; row < height; row++) {
            int edge = Math.min(row, height - 1 - row);
            int inset = cornerInset(edge, radius);
            int left = x + (roundLeft ? inset : 0);
            int right = x + width - (roundRight ? inset : 0);
            graphics.fill(left, y + row, right, y + row + 1, colour);
        }
    }

    private static void fillTopRounded(
            GuiGraphicsExtractor graphics, int x, int y, int width, int height, int radius,
            boolean roundLeft, boolean roundRight, int colour) {
        for (int row = 0; row < height; row++) {
            int inset = cornerInset(row, radius);
            int left = x + (roundLeft ? inset : 0);
            int right = x + width - (roundRight ? inset : 0);
            graphics.fill(left, y + row, right, y + row + 1, colour);
        }
    }

    private static void outlineRounded(
            GuiGraphicsExtractor graphics, int x, int y, int width, int height, int radius,
            boolean roundLeft, boolean roundRight, int colour) {
        for (int row = 0; row < height; row++) {
            int edge = Math.min(row, height - 1 - row);
            int inset = cornerInset(edge, radius);
            int leftInset = roundLeft ? inset : 0;
            int rightInset = roundRight ? inset : 0;
            if (edge == 0) {
                graphics.fill(x + leftInset, y + row,
                        x + width - rightInset, y + row + 1, colour);
            } else {
                graphics.fill(x + leftInset, y + row,
                        x + leftInset + 1, y + row + 1, colour);
                graphics.fill(x + width - rightInset - 1, y + row,
                        x + width - rightInset, y + row + 1, colour);
            }
        }
    }

    private static int cornerInset(int edge, int radius) {
        if (edge >= radius) {
            return 0;
        }
        if (radius >= 6) {
            return edge == 0 ? 4 : edge == 1 ? 2 : edge == 2 ? 1 : 0;
        }
        return edge == 0 ? 2 : edge == 1 ? 1 : 0;
    }

    private static Identifier texture(String path) {
        return Identifier.fromNamespaceAndPath(SkydexMod.MOD_ID, "greenhouse/" + path + ".png");
    }

    private static Identifier guiTexture(String path) {
        return Identifier.fromNamespaceAndPath(SkydexMod.MOD_ID, "gui/" + path + ".png");
    }

    private static void blit(
            GuiGraphicsExtractor graphics, Identifier texture, int x, int y, int width, int height) {
        TextureUv uv = TextureUv.FULL;
        graphics.blit(texture, x, y, x + width, y + height,
                uv.u0(), uv.u1(), uv.v0(), uv.v1());
    }

    private static boolean inside(double x, double y, int left, int top, int width, int height) {
        return x >= left && x < left + width && y >= top && y < top + height;
    }

    private static MouseButtonEvent virtualEvent(
            MouseButtonEvent event, SettingsLayout layout) {
        return new MouseButtonEvent(
                layout.virtualX(event.x()), layout.virtualY(event.y()), event.buttonInfo());
    }

    /** Minecraft 26.2 moved subtitle extraction from {@code Gui} into its {@code Hud}. */
    private void extractDeferredSubtitles() {
        try {
            Object owner = minecraft.gui;
            java.lang.reflect.Method method;
            try {
                method = owner.getClass().getMethod("extractDeferredSubtitles");
            } catch (NoSuchMethodException movedIn262) {
                owner = owner.getClass().getField("hud").get(owner);
                method = owner.getClass().getMethod("extractDeferredSubtitles");
            }
            method.invoke(owner);
        } catch (ReflectiveOperationException ignored) {
            // Decorative compatibility call only.
        }
    }

    // --------------------------------------------------------------- input

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubled) {
        SettingsLayout layout = SettingsLayout.of(width, height);
        MouseButtonEvent virtualEvent = virtualEvent(event, layout);
        if (dataOpen
                && !inside(virtualEvent.x(), virtualEvent.y(), layout.rightX(), layout.exportY(),
                layout.dataWidth(), SettingsLayout.EXPORT_H)
                && !inside(virtualEvent.x(), virtualEvent.y(), layout.dataMenuX(), layout.dataMenuY(),
                layout.dataMenuWidth(), layout.dataMenuHeight())) {
            dataOpen = false;
        }
        refreshWidgets();
        return super.mouseClicked(virtualEvent, doubled);
    }

    @Override
    public boolean mouseReleased(MouseButtonEvent event) {
        return super.mouseReleased(virtualEvent(event, SettingsLayout.of(width, height)));
    }

    @Override
    public boolean mouseDragged(MouseButtonEvent event, double dragX, double dragY) {
        return super.mouseDragged(
                virtualEvent(event, SettingsLayout.of(width, height)),
                dragX / SettingsLayout.RENDER_SCALE,
                dragY / SettingsLayout.RENDER_SCALE);
    }

    @Override
    public boolean keyPressed(KeyEvent event) {
        if (event.key() == InputConstants.KEY_ESCAPE) {
            MenuDismissal dismissal = MenuDismissal.forEscape(dataOpen, presetOpen);
            if (dismissal.handled()) {
                dataOpen = dismissal.dataOpen();
                if (presetOpen != dismissal.presetOpen()) {
                    setPresetOpen(dismissal.presetOpen());
                }
                refreshWidgets();
                return true;
            }
        }
        return super.keyPressed(event);
    }

    @Override
    public void onClose() {
        mod.saveConfig();
        mod.saveLayouts();
        super.onClose();
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    private record Connection(boolean connected, String visible, String tooltip) {
    }

    private record BriefItem(String id, String name, int count) {
    }

    private record LayoutBrief(
            String goal, String drawerGoal, int cellCount,
            List<BriefItem> targets, List<BriefItem> inputs) {
    }

    private static final class GreenhouseShareCodeLimits {
        private static final int MAX_INPUT = 16 * 1024;
    }
}
