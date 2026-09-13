import { createElement, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ProfileProgressBody } from "./ProfileProgressBody";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  as?: "div" | "button";
  icon: ReactNode;
  children: ReactNode;
  detail?: boolean;
};

/** Shared icon, text and track geometry; each domain retains its own actions and values. */
export function ProfileProgressRow({ as: Element = "div", icon, children, detail, className = "", ...props }: Props) {
  return createElement(Element, { ...props, className: `profile-skill profile-progress-row${detail ? " profile-progress-row--detail" : ""} ${className}` }, icon, <ProfileProgressBody>{children}</ProfileProgressBody>);
}
