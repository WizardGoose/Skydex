package com.skydex.location;

import com.skydex.capture.ItemIds;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.world.scores.DisplaySlot;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.PlayerTeam;
import net.minecraft.world.scores.ScoreHolder;
import net.minecraft.world.scores.Scoreboard;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Works out where the player is, using only what the client already renders:
 * the sidebar scoreboard and the tab list.
 *
 * <p>Deliberately <b>not</b> using {@code /locraw}: sending a command on the
 * player's behalf would make the mod active rather than passive, which is the
 * line the spec draws for Hypixel-rules compliance. The Hypixel mod API would
 * give this cleanly without polling, but it costs the user an extra mod
 * install; scoreboard reading is dependency-free and equally passive.
 */
public final class LocationTracker {

    /** Hypixel's private-use area glyph, plus the ⏣ fallback some fonts show. */
    private static final char AREA_ICON = '';
    private static final char AREA_ICON_ALT = '⏣';

    private static final String PROFILE_PREFIX = "Profile: ";
    private static final String PRIVATE_ISLAND_AREA = "Your Island";

    private boolean onHypixel;
    private boolean onSkyBlock;
    private String area = "";
    /** Every sidebar line from the last update, so callers can ask more than one. */
    private List<String> sidebar = List.of();
    private String profileName;
    private String gameMode;

    public boolean isOnSkyBlock() {
        return onSkyBlock;
    }

    public boolean isOnHypixel() {
        return onHypixel;
    }

    public boolean isOnPrivateIsland() {
        return onSkyBlock && PRIVATE_ISLAND_AREA.equalsIgnoreCase(area);
    }

    /**
     * True when the sidebar says the player is on the Garden.
     *
     * <p>Checks every sidebar line rather than {@link #area()}. The area getter
     * returns whichever glyph-bearing line came first out of an unordered
     * collection, which in practice is the location line ("Plot - 3"), not the
     * area name. Asking all of them removes that dependence on ordering.
     */
    public boolean isOnGarden() {
        return onSkyBlock && GardenAreas.isGarden(sidebar);
    }

    /** Sidebar lines from the last update, colour codes already stripped. */
    public List<String> sidebar() {
        return sidebar;
    }

    public String area() {
        return area;
    }

    public String profileName() {
        return profileName;
    }

    public String gameMode() {
        return gameMode;
    }

    /** Cheap enough to call a few times a second; call it from a client tick. */
    public void update(Minecraft client) {
        onHypixel = isConnectedToHypixel(client);
        ClientLevel level = client.level;
        if (level == null || client.player == null) {
            onSkyBlock = false;
            area = "";
            return;
        }
        updateFromScoreboard(level);
        if (onSkyBlock) {
            updateFromTabList(client);
        }
    }

    private static boolean isConnectedToHypixel(Minecraft client) {
        ServerData server = client.getCurrentServer();
        if (server == null || server.ip == null) {
            return false;
        }
        String ip = server.ip.toLowerCase(Locale.ROOT);
        return ip.contains("hypixel.net") || ip.contains("hypixel.io");
    }

    private void updateFromScoreboard(ClientLevel level) {
        Scoreboard scoreboard = level.getScoreboard();
        Objective objective = scoreboard.getDisplayObjective(DisplaySlot.SIDEBAR);
        if (objective == null) {
            onSkyBlock = false;
            area = "";
            this.sidebar = List.of();
            return;
        }
        // The sidebar title is "SKYBLOCK" (or "SKYBLOCK CO-OP", "SKYBLOCK GUEST").
        String title = ItemIds.strip(objective.getDisplayName()).toUpperCase(Locale.ROOT);
        onSkyBlock = title.contains("SKYBLOCK");
        if (!onSkyBlock) {
            area = "";
            this.sidebar = List.of();
            return;
        }
        this.sidebar = sidebarLines(scoreboard, objective);
        area = findArea(this.sidebar);
    }

    /**
     * Sidebar line text lives in each entry's team prefix+suffix, not in the
     * score holder name.
     */
    private static List<String> sidebarLines(Scoreboard scoreboard, Objective sidebar) {
        List<String> lines = new ArrayList<>();
        for (ScoreHolder holder : scoreboard.getTrackedPlayers()) {
            if (!scoreboard.listPlayerScores(holder).containsKey(sidebar)) {
                continue;
            }
            PlayerTeam team = scoreboard.getPlayersTeam(holder.getScoreboardName());
            if (team == null) {
                continue;
            }
            String line = ItemIds.strip(team.getPlayerPrefix()) + ItemIds.strip(team.getPlayerSuffix());
            if (!line.isBlank()) {
                lines.add(line);
            }
        }
        return lines;
    }

    /** The location line is the one carrying the area icon, e.g. "⏣ Your Island". */
    private static String findArea(List<String> lines) {
        for (String line : lines) {
            int icon = indexOfIcon(line);
            if (icon >= 0) {
                return line.substring(icon + 1).trim();
            }
        }
        return "";
    }

    private static int indexOfIcon(String line) {
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == AREA_ICON || c == AREA_ICON_ALT) {
                return i;
            }
        }
        return -1;
    }

    /** Hypixel puts "Profile: <name>" in the tab list while on SkyBlock. */
    private void updateFromTabList(Minecraft client) {
        if (client.getConnection() == null) {
            return;
        }
        for (PlayerInfo entry : client.getConnection().getOnlinePlayers()) {
            if (entry.getTabListDisplayName() == null) {
                continue;
            }
            String name = ItemIds.strip(entry.getTabListDisplayName()).trim();
            if (!name.startsWith(PROFILE_PREFIX)) {
                continue;
            }
            String raw = name.substring(PROFILE_PREFIX.length()).trim();
            gameMode = GameModes.of(raw);
            profileName = GameModes.stripIcons(raw);
            return;
        }
    }

    public void reset() {
        onHypixel = false;
        onSkyBlock = false;
        area = "";
        sidebar = List.of();
        profileName = null;
        gameMode = null;
    }
}
