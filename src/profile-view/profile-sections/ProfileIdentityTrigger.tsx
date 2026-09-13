import type { ReactNode } from "react";
import { ItemTooltip, type ItemTooltipProps } from "../../ui/ItemTooltip";
import "./profile-identity-trigger.css";

export interface ProfileIdentityTriggerProps extends Omit<ItemTooltipProps, "children"> {
  children: ReactNode;
  buttonClassName?: string;
}

/**
 * One interaction target for an entity's icon and name. The first click pins
 * the shared tooltip; its header then owns the explicit Wiki navigation.
 */
export const ProfileIdentityTrigger = ({
  children,
  buttonClassName = "",
  ...tooltip
}: ProfileIdentityTriggerProps) => (
  <ItemTooltip {...tooltip}>
    <button
      type="button"
      className={`profile-identity-trigger ${buttonClassName}`.trim()}
      data-profile-identity-trigger
    >
      {children}
    </button>
  </ItemTooltip>
);

export default ProfileIdentityTrigger;
