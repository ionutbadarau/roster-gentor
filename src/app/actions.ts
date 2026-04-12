"use server";

import { encodedRedirect } from "@/utils/utils";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "../../supabase/server";

export const signUpAction = async (formData: FormData) => {
  if (process.env.NEXT_PUBLIC_SIGNUPS_ENABLED !== 'true') {
    return encodedRedirect(
      "error",
      "/sign-up",
      "Sign-ups are temporarily closed. Please check back soon.",
    );
  }

  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const fullName = formData.get("full_name")?.toString() || '';
  const supabase = await createClient();
  const origin = headers().get("origin");

  if (!email || !password) {
    return encodedRedirect(
      "error",
      "/sign-up",
      "Email and password are required",
    );
  }

  const { data: { user }, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: {
        full_name: fullName,
        email: email,
      }
    },
  });

  console.log("After signUp", error);

  if (error) {
    console.error(error.code + " " + error.message);
    return encodedRedirect("error", "/sign-up", error.message);
  }

  if (user) {
    try {
      const { error: updateError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          name: fullName,
          full_name: fullName,
          email: email,
          user_id: user.id,
          token_identifier: user.id,
          created_at: new Date().toISOString()
        });

      if (updateError) {
        console.error('Error updating user profile:', updateError);
      }
    } catch (err) {
      console.error('Error in user profile creation:', err);
    }
  }

  return encodedRedirect(
    "success",
    "/sign-up",
    "Thanks for signing up! Please check your email for a verification link.",
  );
};


export const forgotPasswordAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const supabase = await createClient();
  const origin = headers().get("origin");
  const callbackUrl = formData.get("callbackUrl")?.toString();

  if (!email) {
    return encodedRedirect("error", "/forgot-password", "Email is required");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Could not reset password",
    );
  }

  if (callbackUrl) {
    return redirect(callbackUrl);
  }

  return encodedRedirect(
    "success",
    "/forgot-password",
    "Check your email for a link to reset your password.",
  );
};

export const resetPasswordAction = async (formData: FormData) => {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  const code = formData.get("code") as string;

  if (!code) {
    return encodedRedirect(
      "error",
      "/sign-in",
      "Invalid or expired password reset link. Please request a new one.",
    );
  }

  if (!password || !confirmPassword) {
    return encodedRedirect(
      "error",
      `/reset-password?code=${encodeURIComponent(code)}`,
      "Password and confirm password are required",
    );
  }

  if (password !== confirmPassword) {
    return encodedRedirect(
      "error",
      `/reset-password?code=${encodeURIComponent(code)}`,
      "Passwords do not match",
    );
  }

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return encodedRedirect(
      "error",
      "/sign-in",
      "Invalid or expired password reset link. Please request a new one.",
    );
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: password,
  });

  if (updateError) {
    await supabase.auth.signOut();
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Password update failed. Please request a new reset link.",
    );
  }

  await supabase.auth.signOut();
  return encodedRedirect(
    "success",
    "/sign-in",
    "Password updated. Please sign in with your new password.",
  );
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/sign-in");
};