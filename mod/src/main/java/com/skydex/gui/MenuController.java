package com.skydex.gui;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.skydex.SkydexMod;
import com.skydex.export.ExportSection;

/** Client-thread access to existing mod features, independent of the renderer. */
public final class MenuController {
    private final SkydexMod mod;
    public MenuController(SkydexMod mod) {this.mod=mod;}
    public JsonObject snapshot() {
        JsonObject out=new JsonObject();out.addProperty("version",mod.modVersion().split("\\+")[0]);
        String connection=mod.httpServer()==null?null:mod.httpServer().connectionLabel();
        out.addProperty("connection",connection==null?"Website: disconnected":"Website: "+connection);out.addProperty("connected",connection!=null);
        var board=mod.greenhouse().currentBoard(net.minecraft.client.Minecraft.getInstance());
        out.add("layout",WebUiModel.layout(mod.layouts().layout(),board));
        out.addProperty("hasLayout",mod.layouts().hasLayout());out.addProperty("helper",mod.placementHelperEnabled());
        out.addProperty("showMutations",mod.layouts().showMutations());
        JsonArray saved=new JsonArray();mod.layouts().savedLayouts().forEach((id,layout)->saved.add(WebUiModel.layout(layout,null)));out.add("loadouts",saved);
        JsonArray sections=new JsonArray();for(var section:ExportSection.capturedSections()) {
            var item=new JsonObject();item.addProperty("id",section.id());item.addProperty("label",section.label());item.addProperty("enabled",mod.config().isExportSectionEnabled(section));sections.add(item);
        }out.add("sections",sections);return out;
    }
    public void importCode(String code) {mod.importLayoutCode(code);}
    public void select(String id) {
        if(!mod.layouts().selectSaved(id))throw new IllegalArgumentException("Saved loadout unavailable");
        mod.saveLayouts();
    }
    public void toggleHelper() {if(mod.layouts().hasLayout())mod.setPlacementHelperEnabled(!mod.placementHelperEnabled());}
    public void toggleMutations() {
        mod.layouts().setShowMutations(!mod.layouts().showMutations());
        mod.saveLayouts();
    }
    public void toggleSection(String id) {
        var section=ExportSection.fromId(id);if(section==null)throw new IllegalArgumentException("Unknown data section");
        mod.setExportSectionEnabled(section,!mod.config().isExportSectionEnabled(section));
    }
    public String exportCode() {return mod.copyExportCode()==null?"Nothing to copy":"Copied";}
}
