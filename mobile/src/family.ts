import { supabase } from './supabase';

export interface FamilyProfile {
  id: string;
  displayName: string;
  relationship: string;
  birthYear: number | null;
}

export async function fetchFamily(): Promise<FamilyProfile[]> {
  const { data, error } = await supabase.from('family_profiles').select('id, display_name, relationship, birth_year').order('created_at');
  if (error) throw new Error('Could not load your family members.');
  return (data ?? []).map(row => ({ id: row.id, displayName: row.display_name, relationship: row.relationship, birthYear: row.birth_year }));
}

export async function addFamilyMember(displayName: string, relationship: string, birthYear: number | null): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user.id) throw new Error('Please sign in again.');
  const { error } = await supabase.from('family_profiles').insert({ user_id: data.session.user.id, display_name: displayName.trim(), relationship: relationship.trim() || 'family member', birth_year: birthYear });
  if (error) throw new Error(error.code === '42P01' ? 'Database update required: apply migration 0006_family_profiles.sql.' : 'Could not add this family member.');
}

export async function removeFamilyMember(id: string): Promise<void> {
  const { error } = await supabase.from('family_profiles').delete().eq('id', id);
  if (error) throw new Error('Could not remove this family member.');
}
