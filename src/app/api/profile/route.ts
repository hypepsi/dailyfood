import { api } from "@/lib/http";
import { profileInput, updateProfile } from "@/services/profile";

export const PUT = api({ body: profileInput }, ({ user, body }) => {
  updateProfile(user, body);
});
