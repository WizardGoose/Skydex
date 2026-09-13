import React from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { recipeItemHref, type RecipeTarget } from "../recipes/itemLink";
import { FOCUS } from "./kit";

export const RecipeLink: React.FC<RecipeTarget & {
  children?: React.ReactNode;
  className?: string;
}> = ({ children = "View in Recipes", className = "", ...target }) => {
  const inRouter = useInRouterContext();
  const props = {
    className: `hover:underline underline-offset-2 ${FOCUS} ${className}`,
    title: `View ${target.name} in Recipes`,
    children,
  };
  const href = recipeItemHref(target);
  return inRouter ? <Link to={href} {...props} /> : <a href={href} {...props} />;
};
