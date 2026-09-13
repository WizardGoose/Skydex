export const toggleMinionDisclosure = (current: ReadonlySet<string>, familyId: string): Set<string> => {
  const next = new Set(current);
  if (next.has(familyId)) next.delete(familyId);
  else next.add(familyId);
  return next;
};

export const closeMinionDisclosure = (current: ReadonlySet<string>, familyId: string): Set<string> => {
  const next = new Set(current);
  next.delete(familyId);
  return next;
};
