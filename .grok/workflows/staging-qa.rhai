let meta = #{
    name: "staging-qa",
    description: "Live QA of staging.voucha.ai: matrices, OTP, Stripe, AWS logs, and issues",
    when_to_use: "QA staging.voucha.ai or run the agentic staging QA workflow",
    phases: [
        #{ title: "Edge and anonymous", detail: "Basic Auth and Anon matrix lanes" },
        #{ title: "Sign in", detail: "Email OTP via Gmail" },
        #{ title: "Signed-in walk", detail: "RU walk, Stripe, AWS logs" },
        #{ title: "Verify and report", detail: "Adversarial verify then report" },
    ],
};

if args == () {
    pause("verification", "Pass args.email (staging login). Optional args.scope (staging-unique|full).");
}

let email = args.email;
if email == () {
    pause("verification", "Pass args.email (staging login). Optional args.scope (staging-unique|full).");
}

let scope = "staging-unique";
if args.scope != () { scope = args.scope; }

let skill_path = ".agents/skills/staging-qa/SKILL.md";

fn output_text(r) {
    if r == () { "no result" } else if type_of(r.output) == "string" { r.output } else { json_encode(r.output) }
}

fn lane_prompt(email_value, scope_value, skill_path_value, lane, matrix_path) {
    let p = "Read " + skill_path_value + " and " + matrix_path + " with read_file before doing anything. ";
    p += "Do not answer from memory. Target https://staging.voucha.ai only. ";
    p += "Lane: " + lane + ". Scope: " + scope_value + ". Login email if needed: " + email_value + ". ";
    p += "Follow the skill for Basic Auth, two browser contexts, recording symbols, and persona skips. ";
    p += "Pace authenticated page fetches. After a 429, wait for retry-after before the next request. Do not burst GETs. ";
    p += "Return a short markdown report of cells walked with symbol, evidence, and skip reasons. ";
    p += "An empty finding list is valid only after you have actually opened the pages.";
    p
}

phase("Edge and anonymous");
let anon_lanes = [
    #{
        label: "anon-sources",
        lane: "anonymous sources",
        matrix_path: "docs/requirements/user-flows/sources.md",
    },
    #{
        label: "anon-topics",
        lane: "anonymous topics",
        matrix_path: "docs/requirements/user-flows/topics.md",
    },
    #{
        label: "anon-posts",
        lane: "anonymous posts",
        matrix_path: "docs/requirements/user-flows/posts.md",
    },
];
let anon_results = [];
for lane in anon_lanes {
    let r = agent(
        lane_prompt(email, scope, skill_path, lane.lane, lane.matrix_path),
        #{ label: lane.label, capability_mode: "all" },
    );
    anon_results.push(#{ label: lane.label, result: r });
}

phase("Sign in");
await_user("user", "Complete email OTP (Turnstile + Gmail u/1 or paste the /login?emailAddress=&otp= deep link), then resume.");

phase("Signed-in walk");
let signed_in_prompt = "Read " + skill_path + " and the three files under docs/requirements/user-flows/ with read_file. ";
signed_in_prompt += "Do not answer from memory. You are continuing a staging QA run as " + email + " on https://staging.voucha.ai. ";
signed_in_prompt += "Scope: " + scope + ". Detect role and GET /api/v1/my/contribution-status before create or Stripe. ";
signed_in_prompt += "Walk signed-in matrix cells this account can execute. Skip impossible personas with a reason. ";
signed_in_prompt += "If create is gated, run Stripe Plus monthly with 4242424242424242 first and wait for invoice.paid. ";
signed_in_prompt += "Then cancel at period end. Correlate failures with CloudWatch /voucha/staging/* and Sentry using x-request-id. ";
signed_in_prompt += "If a user-visible 5xx has no log and no Sentry event, file it via the github-issue skill or a follow-up branch and PR after this run. Do not edit backend or web mid-QA. ";
signed_in_prompt += "Pace authenticated page fetches. After a 429, wait for retry-after before the next request. ";
signed_in_prompt += "Return a markdown report of cells, Stripe, and log correlation.";
let signed_in = agent(signed_in_prompt, #{ label: "signed-in", capability_mode: "all" });

phase("Verify and report");
let report = "# Staging QA report\n\n";
report += "Email: " + email + "\nScope: " + scope + "\n\n";
for item in anon_results {
    report += "## " + item.label + "\n\n";
    if item.result != () && item.result.success {
        report += output_text(item.result) + "\n\n";
    } else {
        report += "Lane failed or returned no evidence. Treat as unverified.\n\n";
    }
}
report += "## signed-in\n\n";
if signed_in != () && signed_in.success {
    report += output_text(signed_in) + "\n\n";
} else {
    report += "Signed-in lane failed or returned no evidence. Treat as unverified.\n\n";
}

let report_path = write_scratch_file("staging-qa-report.md", report);
log("Wrote " + report_path);

complete(#{ path: report_path, report: report });
