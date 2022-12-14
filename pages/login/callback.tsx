import { createStyles, Text, useMantineTheme } from "@mantine/core";
import { IconCircleX, IconLogout, IconCircleCheck } from "@tabler/icons";
import * as database from "@lib/database";
import { withSessionSsr } from "@lib/withSession";
import IconCard from "@components/IconCard";
import * as spotify from "@lib/spotify";
import Head from "next/head";
import { APIUser, getClient, Routes } from "@lib/discord";

interface DiscordCallbackPageProps {
  error?: "access_denied" | "bad_request" | "code_invalid" | "premium_required";
}

export default function DiscordCallbackPage({
  error,
}: DiscordCallbackPageProps) {
  const theme = useMantineTheme();

  const ERRORS: { [key: string]: [string, JSX.Element] } = {
    // User cancelled the login
    access_denied: [
      "Discord login failed",
      <>
        <Text align="center" color="dimmed">
          You have cancelled the login process
        </Text>
      </>,
    ],

    // Invalid query params, CSRF mismatch, or state is invalid (mismatch or expired)
    bad_request: [
      "Invalid request received",
      <>
        <Text align="center" color="dimmed">
          The request received from the browser was invalid or cannot be served.
        </Text>
        <Text align="center" color="dimmed">
          If the problem keeps happening, please restart your browser and try
          again.
        </Text>
      </>,
    ],

    // The code provided is invalid
    code_invalid: [
      "Invalid code received",
      <>
        <Text align="center" color="dimmed">
          The authorization code provided is invalid. Please try again.
        </Text>
      </>,
    ],

    premium_required: [
      "Premium account required",
      <>
        <Text align="center" color="dimmed">
          You need a Spotify Premium account to be able to use Spoticord
        </Text>
      </>,
    ],
  };

  if (error)
    return (
      <>
        <Head>
          <title>{`${ERRORS[error][0]} | Spoticord Accounts`}</title>
        </Head>
        <IconCard
          icon={
            <IconCircleX
              stroke={1.5}
              size={64}
              color={theme.colors.red[5]}
              style={{ display: "block" }}
            />
          }
          title={ERRORS[error][0]}
          description={ERRORS[error][1]}
          close
        />
      </>
    );

  return (
    <>
      <Head>
        <title>Linked Spotify account | Spoticord Accounts</title>
      </Head>
      <IconCard
        icon={
          <IconCircleCheck
            stroke={1.5}
            size={64}
            color={theme.colors.teal[5]}
            style={{ display: "block" }}
          />
        }
        title="Successfully linked Spotify"
        description={
          <>
            <Text align="center" color="dimmed">
              Your Spotify account has successfully been linked with Spoticord.
            </Text>
          </>
        }
        close
        closeColor="teal"
      />
    </>
  );
}

export const getServerSideProps = withSessionSsr(async ({ req, query }) => {
  const { code, error, state } = query;

  if (error) {
    return { props: { error } };
  }

  // No code, no party
  if (
    !state ||
    typeof state !== "string" ||
    !code ||
    typeof code !== "string" ||
    !state.match(/^[a-zA-Z0-9:]*$/g)
  ) {
    return { props: { error: "bad_request" } };
  }

  try {
    // Check for CSRF mismatches
    const { csrf_token: csrf_token } = req.session;

    if (state !== csrf_token) {
      return { props: { error: "bad_request" } };
    }

    // Code -> Access token
    const { access_token, refresh_token, expires_in } =
      await database.requestDiscordToken(code);

    const client = getClient(access_token);
    const user = (await client.get(Routes.user(), { auth: true })) as APIUser;

    try {
      await database.createOrUpdateAccount({
        access_token,
        type: "discord",
        refresh_token,
        expires_in,
        user_id: user.id,
      });
    } catch (ex) {
      return { props: { error: "bad_request" } };
    }

    req.session.user_id = user.id;

    await req.session.save();

    return { redirect: { destination: "/", permanent: false } };
  } catch (ex: any) {
    if (ex.status === 404) {
      return { props: { error: "bad_request" } };
    } else if (ex.status === 400) {
      return { props: { error: "code_invalid" } };
    }

    throw ex;
  }
});
