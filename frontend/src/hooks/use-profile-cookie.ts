import { useCallback, useEffect, useState } from "react";
import {
  getDisplayNameFromProfile,
  profileUpdatedEventName,
  readProfileFromCookie,
  type StoredProfile,
} from "@/lib/profileCookie";

export function useProfileCookie() {
  const [profile, setProfile] = useState<StoredProfile | null>(() => readProfileFromCookie());

  const refresh = useCallback(() => {
    setProfile(readProfileFromCookie());
  }, []);

  useEffect(() => {
    const onUpdate = () => refresh();
    window.addEventListener(profileUpdatedEventName, onUpdate);
    return () => window.removeEventListener(profileUpdatedEventName, onUpdate);
  }, [refresh]);

  const displayName = getDisplayNameFromProfile(profile);

  return { profile, displayName, refresh };
}
