type YearAccessRecord = {
  id: string;
  status: string;
};

type TeamMembershipRecord = {
  id: string;
  is_team_lead: boolean;
};

export type PromotionParticipant = {
  id: string;
  banned: boolean;
  name: string;
  email: string;
  user_id: string | null;
  year_access: YearAccessRecord[];
  team_memberships: TeamMembershipRecord[];
};

export type PromotionContext = {
  participant: PromotionParticipant | null;
  teamLead: {
    id: string;
    year_participant_id: string;
    is_team_lead: boolean;
  } | null;
  profile: {
    id: any;
    global_role: any;
  } | null;
};
