package com.skydex.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

/** One-time directory migration. New writes never use the retired directory. */
public final class DataDirectoryMigration {
    public static final String NOTICE_FILE = "migration-notice.txt";

    private DataDirectoryMigration() {}

    public static Path resolve(Path configRoot) throws IOException {
        Path current = configRoot.resolve("skydex");
        // Read-only compatibility name, required to discover existing installs.
        Path legacy = configRoot.resolve("skyindex");
        if (!Files.exists(legacy, LinkOption.NOFOLLOW_LINKS)) return current;
        if (!Files.isDirectory(legacy, LinkOption.NOFOLLOW_LINKS)
                || Files.isSymbolicLink(legacy)) {
            throw new IOException("The previous data directory is not a regular directory");
        }
        List<Path> contents;
        try (var paths = Files.walk(legacy)) {
            contents = paths.toList();
        }
        if (contents.stream().anyMatch(Files::isSymbolicLink)) {
            throw new IOException("Saved-data migration cannot follow symbolic links");
        }
        System.getLogger("Skydex").log(System.Logger.Level.INFO,
                "Converting previous saved data to config/skydex...");
        if (!Files.exists(current, LinkOption.NOFOLLOW_LINKS)) {
            Files.move(legacy, current);
            writeNotice(current, false);
            return current;
        }
        if (!Files.isDirectory(current, LinkOption.NOFOLLOW_LINKS)
                || Files.isSymbolicLink(current)) {
            throw new IOException("The Skydex data path is not a regular directory");
        }

        // Keep current files when both directories exist. Fill missing files,
        // then archive the entire original tree under the current directory.
        // A failed copy leaves the original tree in place for recovery/retry.
        for (Path source : contents) {
            if (!Files.isRegularFile(source)) continue;
            Path target = current.resolve(legacy.relativize(source));
            Path parent = target.getParent();
            boolean blocked = false;
            for (Path part = parent; !part.equals(current); part = part.getParent()) {
                if (Files.exists(part, LinkOption.NOFOLLOW_LINKS)
                        && (!Files.isDirectory(part, LinkOption.NOFOLLOW_LINKS)
                        || Files.isSymbolicLink(part))) {
                    blocked = true;
                    break;
                }
            }
            if (blocked || Files.exists(target, LinkOption.NOFOLLOW_LINKS)) continue;
            Files.createDirectories(parent);
            Files.copy(source, target);
            if (Files.mismatch(source, target) != -1) {
                throw new IOException("Saved-data migration verification failed");
            }
        }
        Path backups = current.resolve("migration-backups");
        if (Files.isSymbolicLink(backups)) throw new IOException("Migration backup path is a symbolic link");
        Files.createDirectories(backups);
        Files.move(legacy, backups.resolve("previous-data-" + UUID.randomUUID()));
        writeNotice(current, true);
        return current;
    }

    private static void writeNotice(Path current, boolean archived) throws IOException {
        Path notice = current.resolve(NOTICE_FILE);
        if (Files.exists(notice)) return;
        String message = "Converted your previous saved data to config/skydex. "
                + "Your settings, profiles, layouts and plant captures were preserved.";
        if (archived) message += " Older conflicting files are backed up in config/skydex/migration-backups.";
        Files.writeString(notice, message, java.nio.file.StandardOpenOption.CREATE_NEW);
    }
}
