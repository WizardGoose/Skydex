package com.skydex.layout;

import com.skydex.garden.GreenhouseCatalog;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.zip.DataFormatException;
import java.util.zip.Inflater;

/** Decodes the current, self-contained Skydex Greenhouse share link. */
public final class GreenhouseShareDecoder {

    public static final int GRID_SIZE = 10;
    public static final int MAX_ENCODED_LENGTH = 12 * 1024;
    public static final int MAX_COMPRESSED_BYTES = 8 * 1024;
    public static final int MAX_INFLATED_BYTES = 4 * 1024;

    private static final String SHARE_PATH = "/greenhouse/share/";
    private static final String LETTERS = "abcdefghijklmnopqrstuvwxyz";

    // Frozen positional order. Changing it would make existing links decode as
    // different plants while still looking valid.
    private static final List<String> CROPS = List.of(
            "wheat", "potato", "carrot", "pumpkin", "melon", "cocoa_beans",
            "sugar_cane", "cactus", "nether_wart", "red_mushroom", "brown_mushroom",
            "moonflower", "sunflower", "wild_rose", "fire", "dead_plant", "fermento");
    private static final List<String> MUTATIONS = List.of(
            "ashwreath", "choconut", "dustgrain", "gloomgourd", "lonelily",
            "scourroot", "shadevine", "veilshroom", "witherbloom", "chocoberry",
            "cindershade", "coalroot", "creambloom", "duskbloom", "thornshade",
            "blastberry", "cheesebite", "chloronite", "do_not_eat_shroom", "fleshtrap",
            "magic_jellybean", "noctilume", "snoozling", "soggybud", "chorus_fruit",
            "plantboy_advance", "puffercloud", "shellfruit", "startlevine",
            "stoplight_petal", "thunderling", "turtlellini", "zombud", "all_in_aloe",
            "devourer", "glasscorn", "godseed", "jerryflower", "phantomleaf", "timestalk");

    private GreenhouseShareDecoder() {
    }

    public static GreenhouseLayout decode(String input) {
        String code = extractCurrentCode(input);
        if (code.isEmpty()) {
            throw new LayoutFormatException("Paste a Greenhouse share code or link first.");
        }
        if (code.length() > MAX_ENCODED_LENGTH) {
            throw tooLarge();
        }
        if (!code.matches("[A-Za-z0-9_-]+")) {
            throw new LayoutFormatException(
                    "That code is damaged. Copy the whole Skydex share link again.");
        }

        byte[] compressed;
        try {
            String padded = code + "=".repeat((4 - code.length() % 4) % 4);
            compressed = Base64.getUrlDecoder().decode(padded);
        } catch (IllegalArgumentException invalid) {
            throw new LayoutFormatException(
                    "That code is damaged. Copy the whole Skydex share link again.");
        }
        if (compressed.length > MAX_COMPRESSED_BYTES) {
            throw tooLarge();
        }

        String unpacked = inflateUtf8(compressed);
        String[] envelope = unpacked.split("\\|", -1);
        if (envelope.length != 5 || !"v2".equals(envelope[0])) {
            throw new LayoutFormatException(
                    "That is not a current Skydex Greenhouse share code.");
        }

        String name = percentDecode(envelope[1]);
        if (name.isEmpty() || !normaliseName(name).equals(name)) {
            throw new LayoutFormatException("That share code has an invalid layout name.");
        }

        List<String> inputPlants = resolveIndices(envelope[2], false);
        List<String> targetPlants = resolveIndices(envelope[3], true);
        List<LayoutCell> cells = decodeGrid(envelope[4], inputPlants, targetPlants);
        return new GreenhouseLayout(name, GRID_SIZE, GRID_SIZE, cells);
    }

    static String extractCurrentCode(String input) {
        String clean = input == null ? "" : input.replaceAll("\\s+", "");
        int marker = clean.indexOf(SHARE_PATH);
        if (marker >= 0) {
            String tail = clean.substring(marker + SHARE_PATH.length());
            int end = firstDelimiter(tail);
            return end < 0 ? tail : tail.substring(0, end);
        }
        if (clean.contains("://") || clean.contains("/") || clean.contains("?")) {
            throw new LayoutFormatException(
                    "Use a current skydex.ca/greenhouse/share link or its code.");
        }
        return clean;
    }

    private static int firstDelimiter(String value) {
        int result = -1;
        for (char delimiter : new char[]{'/', '?', '#'}) {
            int found = value.indexOf(delimiter);
            if (found >= 0 && (result < 0 || found < result)) {
                result = found;
            }
        }
        return result;
    }

    private static String inflateUtf8(byte[] compressed) {
        Inflater inflater = new Inflater(true);
        inflater.setInput(compressed);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] chunk = new byte[1024];
        try {
            while (!inflater.finished()) {
                int count = inflater.inflate(chunk);
                if (count > 0) {
                    if (output.size() + count > MAX_INFLATED_BYTES) {
                        throw tooLarge();
                    }
                    output.write(chunk, 0, count);
                    continue;
                }
                if (inflater.needsDictionary() || inflater.needsInput()) {
                    throw corrupt();
                }
                throw corrupt();
            }
        } catch (DataFormatException badDeflate) {
            throw corrupt();
        } finally {
            inflater.end();
        }
        if (output.size() == 0) {
            throw corrupt();
        }
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(output.toByteArray())).toString();
        } catch (CharacterCodingException invalidUtf8) {
            throw corrupt();
        }
    }

    private static List<String> resolveIndices(String value, boolean targets) {
        if (value.isEmpty()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (String token : value.split(",", -1)) {
            int index;
            try {
                if (token.isEmpty() || !token.matches("[0-9a-z]+")) {
                    throw new NumberFormatException();
                }
                index = Integer.parseInt(token, 36);
            } catch (NumberFormatException invalid) {
                throw invalidLayout();
            }
            String id = resolveIndex(index);
            if (targets && index < CROPS.size()) {
                throw invalidLayout();
            }
            result.add(id);
        }
        return result;
    }

    private static String resolveIndex(int index) {
        if (index >= 0 && index < CROPS.size()) {
            return CROPS.get(index);
        }
        int mutation = index - CROPS.size();
        if (mutation >= 0 && mutation < MUTATIONS.size()) {
            return MUTATIONS.get(mutation);
        }
        throw new LayoutFormatException(
                "This layout uses plants this mod does not know yet. Update the mod and try again.");
    }

    private static List<LayoutCell> decodeGrid(
            String grid, List<String> inputPlants, List<String> targetPlants) {
        boolean doubled = grid.length() == GRID_SIZE * GRID_SIZE * 2;
        int charWidth = doubled ? 2 : 1;
        if (grid.length() != GRID_SIZE * GRID_SIZE * charWidth) {
            throw invalidLayout();
        }

        List<LayoutCell> cells = new ArrayList<>();
        String empty = doubled ? ".." : ".";
        for (int position = 0; position < GRID_SIZE * GRID_SIZE; position++) {
            String chars = grid.substring(position * charWidth, (position + 1) * charWidth);
            if (empty.equals(chars)) {
                continue;
            }
            boolean target = chars.equals(chars.toUpperCase(Locale.ROOT))
                    && !chars.equals(chars.toLowerCase(Locale.ROOT));
            boolean input = chars.equals(chars.toLowerCase(Locale.ROOT))
                    && !chars.equals(chars.toUpperCase(Locale.ROOT));
            if (!target && !input) {
                continue;
            }
            int localIndex = doubled ? doubleIndex(chars) : LETTERS.indexOf(
                    chars.toLowerCase(Locale.ROOT));
            List<String> plants = target ? targetPlants : inputPlants;
            if (localIndex < 0 || localIndex >= plants.size()) {
                continue;
            }
            String id = plants.get(localIndex);
            int row = position / GRID_SIZE;
            int column = position % GRID_SIZE;
            String name = GreenhouseCatalog.displayName(id);
            String ground = GreenhouseCatalog.ground(id);
            boolean mutation = target || MUTATIONS.contains(id);
            cells.add(mutation
                    ? LayoutCell.mutation(column, row, name, ground)
                    : LayoutCell.crop(column, row, name, ground));
        }
        return cells;
    }

    private static int doubleIndex(String chars) {
        if (chars.length() != 2) {
            return -1;
        }
        int first = LETTERS.indexOf(Character.toLowerCase(chars.charAt(0)));
        int second = LETTERS.indexOf(Character.toLowerCase(chars.charAt(1)));
        return first < 0 || second < 0 ? -1 : first * LETTERS.length() + second;
    }

    private static String percentDecode(String encoded) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(encoded.length());
        for (int i = 0; i < encoded.length(); i++) {
            char c = encoded.charAt(i);
            if (c == '%') {
                if (i + 2 >= encoded.length()) {
                    throw invalidLayout();
                }
                int high = Character.digit(encoded.charAt(i + 1), 16);
                int low = Character.digit(encoded.charAt(i + 2), 16);
                if (high < 0 || low < 0) {
                    throw invalidLayout();
                }
                bytes.write((high << 4) | low);
                i += 2;
            } else {
                if (c > 0x7F) {
                    throw invalidLayout();
                }
                bytes.write((byte) c);
            }
        }
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
        } catch (CharacterCodingException invalidUtf8) {
            throw invalidLayout();
        }
    }

    static String normaliseName(String value) {
        StringBuilder result = new StringBuilder();
        boolean pendingSpace = false;
        int codePoints = 0;
        for (int offset = 0; offset < value.length() && codePoints < 80;) {
            int codePoint = value.codePointAt(offset);
            offset += Character.charCount(codePoint);
            boolean space = codePoint < 32 || codePoint == 127 || Character.isWhitespace(codePoint);
            if (space) {
                pendingSpace = result.length() > 0;
                continue;
            }
            if (pendingSpace) {
                result.append(' ');
                pendingSpace = false;
                codePoints++;
                if (codePoints >= 80) {
                    break;
                }
            }
            result.appendCodePoint(codePoint);
            codePoints++;
        }
        return result.toString();
    }

    private static LayoutFormatException tooLarge() {
        return new LayoutFormatException(
                "That layout code is too large to open safely. Ask for a fresh share link.");
    }

    private static LayoutFormatException corrupt() {
        return new LayoutFormatException(
                "That code could not be unpacked. Copy the whole Skydex share link again.");
    }

    private static LayoutFormatException invalidLayout() {
        return new LayoutFormatException(
                "That code unpacked, but it was not a valid Greenhouse layout.");
    }
}
