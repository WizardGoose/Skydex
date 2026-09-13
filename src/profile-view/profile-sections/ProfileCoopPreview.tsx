import React from "react";
import { Landmark, Wrench } from "lucide-react";
import { coins, exactCoins } from "../../networth/format";
import type { ProfileStatusView } from "../../profile/profileStatus";
import {
  resolveProfileSectionState,
} from "../../profile/riftMuseumDungeons";
import type {
  ProfileBankTransactionRow,
  ProfileCoopPreviewModel,
  ProfileUpgradeRow,
} from "../../profile/profileWorlds";
import {
  ProfilePbcDisclosure,
  ProfilePbcHeader,
  ProfilePbcLoading,
  ProfilePbcStatusLine,
  ProfilePbcUnavailable,
} from "./ProfilePbcShared";
import "./rift-museum-dungeons.css";
import "./profile-worlds.css";

export interface ProfileCoopPreviewProps {
  status: ProfileStatusView;
  model: ProfileCoopPreviewModel | null;
  error?: string | null;
}

const RECENT_ACTIVITY_LIMIT = 8;
const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const formatDate = (timestamp: number | null): string => timestamp === null ? "Time unavailable" : dateTime.format(new Date(timestamp));

const upgradeCopy = (row: ProfileUpgradeRow): string => {
  if (row.state === "claimed") return row.claimedAt === null ? "Claimed" : `Claimed ${formatDate(row.claimedAt)}`;
  if (row.state === "active") return row.startedAt === null ? "In progress" : `Started ${formatDate(row.startedAt)}`;
  if (row.state === "queued") return "Queued";
  return row.startedAt === null ? "Recorded upgrade" : `Recorded ${formatDate(row.startedAt)}`;
};

const UpgradeCard: React.FC<{ row: ProfileUpgradeRow }> = ({ row }) => (
  <article className="profile-world-upgrade-card">
    <Wrench aria-hidden />
    <div><strong>{row.label}</strong><small>{row.tier === null ? "Tier unavailable" : `Tier ${row.tier.toLocaleString()}`}</small></div>
    <span>{upgradeCopy(row)}</span>
  </article>
);

const TransactionRow: React.FC<{ row: ProfileBankTransactionRow }> = ({ row }) => (
  <article className="profile-world-transaction-row">
    <Landmark aria-hidden />
    <div><strong>{row.action}</strong><small>{row.initiator ?? "Member unavailable"} · {formatDate(row.timestamp)}</small></div>
    <b className="profile-number" title={exactCoins(row.amount)}>{coins(row.amount)}</b>
  </article>
);

export const ProfileBankHistoryPages: React.FC<{ rows: readonly ProfileBankTransactionRow[] }> = ({ rows }) => {
  const [page, setPage] = React.useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / RECENT_ACTIVITY_LIMIT));
  const visiblePage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(visiblePage * RECENT_ACTIVITY_LIMIT, (visiblePage + 1) * RECENT_ACTIVITY_LIMIT);
  return (
    <div className="profile-world-history-pages">
      <div className="profile-world-transaction-grid">{visibleRows.map((row) => <TransactionRow key={row.key} row={row} />)}</div>
      {pageCount > 1 && (
        <nav aria-label="Additional bank history pages">
          <button type="button" disabled={visiblePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
          <span className="profile-number">Page {visiblePage + 1} of {pageCount}</span>
          <button type="button" disabled={visiblePage + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Next</button>
        </nav>
      )}
    </div>
  );
};

export const ProfileCoopPreview: React.FC<ProfileCoopPreviewProps> = ({ status, model, error = null }) => {
  const visibleState = resolveProfileSectionState(status, model?.state);
  const activeUpgrades = model?.upgrades.filter((row) => row.state === "active" || row.state === "queued") ?? [];
  const upgradeHistory = model?.upgrades.filter((row) => row.state === "claimed" || row.state === "unknown") ?? [];
  const recentTransactions = model?.transactions.slice(0, RECENT_ACTIVITY_LIMIT) ?? [];
  const additionalTransactions = model?.transactions.slice(RECENT_ACTIVITY_LIMIT) ?? [];

  return (
    <section className="profile-rmd-preview profile-world-preview" aria-label="Profile and Co-op" data-profile-section-state={visibleState}>
      <section className="profile-rmd-shell profile-glass" aria-label="Shared profile data">
        <ProfilePbcHeader
          eyebrow="Profile / Co-op"
          title="Shared profile"
          count={model?.memberCount ?? null}
          countLabel="members"
        />
        {visibleState === "loading" ? (
          <ProfilePbcLoading rows={5} />
        ) : visibleState === "private" || visibleState === "unavailable" || !model ? (
          <ProfilePbcUnavailable status={status} noun="Shared profile" error={error} />
        ) : (
          <div className="profile-rmd-content profile-world-content">
            <ProfilePbcStatusLine status={status} partial={visibleState === "partial"} />
            <section className="profile-world-coop-current" aria-labelledby="coop-current-title">
              <header><strong id="coop-current-title">Current profile</strong><span>{model.selected ? "Selected profile" : "Profile summary"}</span></header>
              <dl className="profile-world-current-grid profile-world-current-grid--coop">
                <div><dt>Profile</dt><dd>{model.profileName}</dd></div>
                <div><dt>Mode</dt><dd>{model.gameMode ?? "Unavailable"}</dd></div>
                <div><dt>Members</dt><dd className="profile-number">{model.memberCount === null ? "Unavailable" : model.memberCount.toLocaleString()}</dd></div>
                <div><dt>Bank balance</dt><dd className="profile-number" title={model.bankBalance === null ? "Bank data unavailable" : exactCoins(model.bankBalance)}>{model.bankBalance === null ? "Unavailable" : coins(model.bankBalance)}</dd></div>
              </dl>
            </section>

            <section className="profile-world-active-upgrades" aria-labelledby="coop-upgrades-title">
              <header><strong id="coop-upgrades-title">Active and queued upgrades</strong><span>{activeUpgrades.length.toLocaleString()}</span></header>
              {!model.communityShared ? <p className="profile-rmd-field-state">Community upgrade data is unavailable.</p> : activeUpgrades.length === 0 ? (
                <p className="profile-rmd-field-state">No active or queued Community Upgrades are recorded.</p>
              ) : <div className="profile-world-upgrade-grid">{activeUpgrades.map((row) => <UpgradeCard key={row.key} row={row} />)}</div>}
            </section>

            <section className="profile-world-recent-activity" aria-labelledby="coop-activity-title">
              <header><strong id="coop-activity-title">Recent bank activity</strong><span>Newest {RECENT_ACTIVITY_LIMIT}</span></header>
              {!model.bankShared ? <p className="profile-rmd-field-state">Co-op bank activity is unavailable.</p> : recentTransactions.length === 0 ? (
                <p className="profile-rmd-field-state">No shared bank transactions are recorded.</p>
              ) : <div className="profile-world-transaction-grid">{recentTransactions.map((row) => <TransactionRow key={row.key} row={row} />)}</div>}
            </section>

            <div className="profile-rmd-pages profile-world-depth">
              {upgradeHistory.length > 0 && <ProfilePbcDisclosure storageId="profile-coop-upgrade-history" title="Upgrade history" count={upgradeHistory.length} initiallyExpanded={false}>
                <div className="profile-world-upgrade-grid">{upgradeHistory.map((row) => <UpgradeCard key={row.key} row={row} />)}</div>
              </ProfilePbcDisclosure>}
              {additionalTransactions.length > 0 && (
                <ProfilePbcDisclosure storageId="profile-coop-additional-bank" title="Additional bank history" count={additionalTransactions.length} initiallyExpanded={false}>
                  <ProfileBankHistoryPages rows={additionalTransactions} />
                </ProfilePbcDisclosure>
              )}
            </div>
          </div>
        )}
      </section>
    </section>
  );
};

export default ProfileCoopPreview;
