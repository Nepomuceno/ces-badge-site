import { Link, createFileRoute } from "@tanstack/react-router";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "../state/AuthContext";
import {
  type LogoEntry,
  type SubmitLogoInput,
  useLogoLibrary,
} from "../state/LogoLibraryContext";
import { LogoCard } from "../components/LogoCard";
import { SignInPrompt } from "../components/AuthPrompts";
import { normalizeAlias } from "../lib/auth-utils";

export const Route = createFileRoute("/my-logos")({
  component: MyLogosPage,
});

function MyLogosPage() {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const {
    allLogos,
    submitLogo,
    getLogosSubmittedBy,
    getLogosOwnedBy,
    assignOwner,
    removeLogo,
  } = useLogoLibrary();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [ownerInput, setOwnerInput] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    if (user && !isAdmin) {
      setOwnerInput(normalizeAlias(user.alias));
    }
  }, [isAdmin, user]);

  const submitted = useMemo<LogoEntry[]>(() => {
    if (!user) return [];
    return getLogosSubmittedBy(user.email);
  }, [getLogosSubmittedBy, user]);

  const owned = useMemo<LogoEntry[]>(() => {
    if (!user) return [];
    const alias = normalizeAlias(user.alias);
    if (!alias) return [];
    return getLogosOwnedBy(alias);
  }, [getLogosOwnedBy, user]);

  const latestSubmission = submitted[0] ?? null;
  const latestSubmittedAt = latestSubmission
    ? new Date(
        latestSubmission.updatedAt ?? latestSubmission.createdAt
      ).toLocaleString()
    : null;
  const latestOwnerAlias = latestSubmission
    ? (latestSubmission.ownerAlias ??
      (latestSubmission.submittedBy
        ? normalizeAlias(latestSubmission.submittedBy)
        : null))
    : null;
  const summaryStats = [
    {
      label: "Active submissions",
      value: submitted.length.toLocaleString(),
    },
    {
      label: "Logos you own",
      value: owned.length.toLocaleString(),
    },
    {
      label: "Catalog entries",
      value: allLogos.length.toLocaleString(),
    },
  ];

  const workflowSteps = [
    "Sketch a CES3 badge concept using the guardrails so “CES3” reads clearly at badge size.",
    "Upload the SVG or high-res PNG and confirm the automatic codename looks right before sharing.",
    "Drop the codename in Teams to collect reactions, then monitor votes from the gallery.",
  ];

  if (!isAuthenticated || !user) {
    return (
      <SignInPrompt
        heading="Sign in to manage logos"
        description="Enter your alias to manage submissions, upload new concepts, and collaborate with the CES3 brand council."
      />
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!imageFile) {
      setStatusMessage("Please attach an image before submitting.");
      return;
    }

    setStatusMessage(null);
    setIsSubmitting(true);

    try {
      const imageDataUrl = await readFileAsDataUrl(imageFile);

      const form = event.currentTarget;
      const formData = new FormData(form);

      const name = String(formData.get("name") ?? "").trim();
      const description = String(formData.get("description") ?? "").trim();
      const ownerAlias = resolveOwnerAlias(ownerInput, user.alias, isAdmin);

      const basePayload: SubmitLogoInput = {
        name,
        description: description.length > 0 ? description : undefined,
        image: imageDataUrl,
        submittedBy: user.email,
        ownerAlias,
      };

      if (!basePayload.name) {
        setStatusMessage("Name is required to generate the codename.");
        setIsSubmitting(false);
        return;
      }

      await submitLogo(basePayload);
      form.reset();
      setNameInput("");
      setImageFile(null);
      const defaultAlias = normalizeAlias(user.alias);
      setOwnerInput(isAdmin ? "" : defaultAlias);
      setStatusMessage(
        "Logo submitted! The codename was generated automatically from the name."
      );
    } catch (error) {
      console.error("Failed to submit logo", error);
      setStatusMessage(
        "Something went wrong. Try again or contact the CES3 design council."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const codenamePreview = generateCodename(nameInput);

  return (
    <div className="space-y-12 pb-16">
      <header className="space-y-4">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/70">
          Logo collaboration
        </p>
        <h1 className="text-4xl font-semibold text-white">My submissions</h1>
        <p className="text-white/70">
          Upload new variants, review what you have already shared, and manage
          ownership. Files stay local for now so you have control before the
          official rollout.
        </p>
      </header>

      {statusMessage && (
        <div className="rounded-3xl border border-cyan-300/40 bg-cyan-500/15 p-5 text-sm text-cyan-100 shadow-[0_18px_36px_rgba(8,25,44,0.45)]">
          {statusMessage}
        </div>
      )}

      <section className="grid gap-8 xl:grid-cols-[minmax(0,_1fr)_340px]">
        <form
          onSubmit={handleSubmit}
          className="relative overflow-hidden space-y-6 rounded-3xl border border-white/10 bg-gradient-to-br from-[#101d33]/90 via-[#0a1424]/90 to-[#050b15]/95 p-8 shadow-[0_30px_70px_rgba(3,10,24,0.55)] backdrop-blur"
        >
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-white">Upload a logo</h2>
            <p className="text-sm text-white/60">
              Keep files under 2&nbsp;MB and lean on the badge guidelines for
              maximum impact when teammates print.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Name
              <input
                name="name"
                type="text"
                required
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                className="rounded-full border border-white/15 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/40"
              />
            </label>
            <div className="flex flex-col justify-end gap-1 text-xs uppercase tracking-[0.25em] text-white/50">
              <span>Codename preview</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/70">
                {codenamePreview || "—"}
              </span>
              <span className="text-[10px] normal-case text-white/40">
                Generated automatically from the name using lowercase letters
                and dashes.
              </span>
            </div>
          </div>
          <label className="flex flex-col gap-2 text-sm text-white/70">
            Description (optional)
            <textarea
              name="description"
              rows={4}
              className="min-h-[140px] rounded-3xl border border-white/15 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-white/70">
            Image asset
            <input
              name="image"
              type="file"
              accept="image/*"
              required
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setImageFile(file);
              }}
              className="rounded-full border border-white/20 bg-slate-950/60 px-4 py-2 text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/40"
            />
            <span className="text-xs text-white/40">
              Upload any image format (SVG, PNG, JPG). Files stay local for now.
            </span>
          </label>
          <label className="flex flex-col gap-2 text-sm text-white/70">
            Owner alias
            <input
              type="text"
              value={ownerInput}
              onChange={(event) => setOwnerInput(event.target.value)}
              placeholder={isAdmin ? "e.g. cedarfox" : user.alias}
              disabled={!isAdmin}
              className="rounded-full border border-white/20 bg-slate-950/60 px-4 py-3 text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/40 disabled:cursor-not-allowed disabled:text-white/40"
            />
            <span className="text-xs text-white/40">
              {isAdmin
                ? "Leave blank to default to the submitter alias."
                : "Logos default to you as the owner. Admins can reassign ownership later."}
            </span>
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-full bg-cyan-400 px-6 py-3 text-base font-semibold text-slate-900 shadow-[0_15px_35px_rgba(28,201,255,0.35)] transition hover:bg-cyan-300 disabled:cursor-wait"
          >
            {isSubmitting ? "Uploading…" : "Submit logo"}
          </button>
        </form>
        <div className="space-y-6">
          {latestSubmission ? (
            <div className="space-y-4 rounded-3xl border border-cyan-300/40 bg-gradient-to-br from-cyan-400/20 via-cyan-400/10 to-transparent p-6 text-white shadow-[0_26px_60px_rgba(7,26,42,0.55)]">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-100/80">
                Latest upload
              </p>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-white">
                  {latestSubmission.name}
                </h3>
                <p className="text-sm text-white/70">
                  Codename {latestSubmission.codename}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.3em] text-white/60">
                {latestSubmittedAt && <span>Updated {latestSubmittedAt}</span>}
                {latestOwnerAlias && <span>Owner @{latestOwnerAlias}</span>}
              </div>
              <Link
                to={`/gallery/${encodeURIComponent(latestSubmission.id)}`}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:text-cyan-50"
              >
                View in gallery
                <span aria-hidden>→</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-white/80 shadow-[0_18px_36px_rgba(6,16,32,0.45)]">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">
                Ready to ship
              </p>
              <h3 className="text-xl font-semibold text-white">
                Start your first badge upload
              </h3>
              <p className="text-sm text-white/70">
                Once you submit, your concept will appear here with a quick link
                back to the gallery for feedback.
              </p>
            </div>
          )}

          <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-white/80 shadow-[0_18px_36px_rgba(6,16,32,0.45)]">
            <h3 className="text-lg font-semibold text-white">
              Badge builder workflow
            </h3>
            <ul className="space-y-3 text-sm">
              {workflowSteps.map((step) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-300" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/guidelines"
              className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-100 transition hover:text-cyan-50"
            >
              Review badge guidelines
              <span aria-hidden>↗</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {summaryStats.map((stat, index) => (
          <div
            key={stat.label}
            className={`rounded-3xl border border-white/10 p-6 shadow-[0_22px_45px_rgba(5,16,32,0.5)] backdrop-blur ${
              index === 0
                ? "border-cyan-300/40 bg-gradient-to-br from-cyan-400/20 via-cyan-400/10 to-transparent"
                : "bg-white/5"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">
              {stat.label}
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {stat.value}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              Your submitted logos
            </h2>
            <p className="text-sm text-white/60">
              Track revisions and jump to the gallery to continue gathering
              votes.
            </p>
          </div>
        </header>
        {submitted.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-white/70">
            Nothing here yet—upload a concept above to add it to the CES3
            studio.
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {submitted.map((logo) => (
              <LogoCard
                key={logo.id}
                logo={logo}
                isFavorite={false}
                onFavoriteToggle={() => undefined}
                showFavoriteAction={false}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Logos you own</h2>
            <p className="text-sm text-white/60">
              Owners can refresh metadata and keep assets compliant.
            </p>
          </div>
        </header>
        {owned.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-white/70">
            You are not assigned to any logos yet.
          </div>
        ) : (
          <div className="grid gap-6">
            {owned.map((logo) => (
              <OwnedLogoRow
                key={logo.id}
                logo={logo}
                isAdmin={isAdmin}
                assignOwner={assignOwner}
                onRemove={
                  isAdmin
                    ? async (id) => {
                        await removeLogo(id, user.email);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="space-y-6">
          <header>
            <h2 className="text-2xl font-semibold text-white">
              Admin oversight
            </h2>
            <p className="text-sm text-white/60">
              Update ownership for any logo in the catalog.
            </p>
          </header>
          <div className="space-y-3">
            {allLogos.map((logo) => (
              <OwnedLogoRow
                key={`admin-${logo.id}`}
                logo={logo}
                isAdmin
                assignOwner={assignOwner}
                onRemove={async (id) => {
                  await removeLogo(id, user.email);
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OwnedLogoRow({
  logo,
  isAdmin,
  assignOwner,
  onRemove,
}: {
  logo: LogoEntry;
  isAdmin: boolean;
  assignOwner: (id: string, owner: string | null) => void;
  onRemove?: (id: string) => Promise<void>;
}) {
  const [localOwner, setLocalOwner] = useState<string>(logo.ownerAlias ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const isRemoved = Boolean(logo.removedAt);

  useEffect(() => {
    setLocalOwner(logo.ownerAlias ?? "");
  }, [logo.ownerAlias]);

  return (
    <div
      className={`flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 md:flex-row md:items-center md:justify-between ${isRemoved ? "opacity-60" : ""}`}
    >
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-white/50">
          {logo.codename}
        </p>
        <p className="text-lg font-semibold text-white">{logo.name}</p>
        {logo.submittedBy && (
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/70">
            Submitted by {logo.submittedBy}
          </p>
        )}
        {logo.ownerAlias && (
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">
            Owned by @{logo.ownerAlias}
          </p>
        )}
        {isRemoved && (
          <p className="text-xs uppercase tracking-[0.2em] text-rose-300/80">
            Removed from catalog
            {logo.removedAt
              ? ` on ${new Date(logo.removedAt).toLocaleString()}`
              : ""}
            {logo.removedBy ? ` by ${logo.removedBy}` : ""}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3 md:w-1/2">
        <label className="flex flex-col gap-2 text-xs text-white/60">
          Owner
          <input
            type="text"
            value={localOwner}
            onChange={(event) => setLocalOwner(event.target.value)}
            disabled={!isAdmin || isRemoved}
            placeholder="cedarfox"
            className="rounded-full border border-white/20 bg-slate-900/70 px-4 py-2 text-sm text-white outline-none transition focus:border-cyan-300 disabled:cursor-not-allowed disabled:text-white/40"
          />
        </label>
        <button
          type="button"
          disabled={!isAdmin || isRemoved}
          onClick={() => {
            const fallbackAlias =
              logo.ownerAlias ??
              (logo.submittedBy ? normalizeAlias(logo.submittedBy) : "");
            const nextOwner = resolveOwnerAlias(
              localOwner,
              fallbackAlias,
              true
            );
            assignOwner(logo.id, nextOwner);
            setMessage("Ownership updated");
            setTimeout(() => setMessage(null), 3000);
          }}
          className="self-start rounded-full border border-cyan-300/40 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200 hover:text-cyan-50 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Update owner
        </button>
        {isAdmin && onRemove && !isRemoved && (
          <button
            type="button"
            disabled={isRemoving}
            onClick={() => {
              setIsRemoving(true);
              void onRemove(logo.id)
                .then(() => {
                  setMessage("Logo removed from catalog");
                  setTimeout(() => setMessage(null), 3000);
                })
                .catch((error) => {
                  console.error("Failed to remove logo", error);
                  setMessage("Failed to remove logo.");
                  setTimeout(() => setMessage(null), 4000);
                })
                .finally(() => {
                  setIsRemoving(false);
                });
            }}
            className="self-start rounded-full border border-rose-400/60 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-300 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isRemoving ? "Removing…" : "Remove from catalog"}
          </button>
        )}
        {message && <p className="text-xs text-cyan-200/80">{message}</p>}
      </div>
    </div>
  );
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to parse file"));
      }
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function resolveOwnerAlias(
  input: string,
  fallback: string,
  allowOverride: boolean
): string | null {
  const normalizedFallback = normalizeAlias(fallback ?? "");
  if (!allowOverride) {
    return normalizedFallback || null;
  }

  const trimmedInput = input.trim();
  if (trimmedInput.length === 0) {
    return normalizedFallback || null;
  }

  const candidate = normalizeAlias(trimmedInput);
  return candidate.length > 0 ? candidate : normalizedFallback || null;
}

function generateCodename(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
