// Maps free-text ethnicity input to one of the race keys with data in the County Health Rankings
export type RaceKey = 'Black' | 'White' | 'Hispanic' | 'Asian' | null;

export function mapEthnicity(ethnicity: string): RaceKey {
  if (!ethnicity) return null;
  const e = ethnicity.toLowerCase();
  if (/black|african american|afro|nigerian|ghanaian|jamaican|haitian|caribbean/.test(e)) return 'Black';
  if (/hispanic|latino|latina|latinx|mexican|puerto rican|cuban|dominican|salvadoran|colombian|guatemalan|peruvian/.test(e)) return 'Hispanic';
  if (/asian|chinese|japanese|korean|vietnamese|filipino|indian|south asian|east asian|southeast asian|bangladeshi|pakistani|sri lankan/.test(e)) return 'Asian';
  if (/white|caucasian|european|irish|italian|german|french|polish|russian|scandinavian|anglo/.test(e)) return 'White';
  return null;
}

export function raceLabel(key: RaceKey): string {
  switch (key) {
    case 'Black':    return 'Black residents';
    case 'White':    return 'White residents';
    case 'Hispanic': return 'Hispanic residents';
    case 'Asian':    return 'Asian residents';
    default:         return 'all residents';
  }
}
