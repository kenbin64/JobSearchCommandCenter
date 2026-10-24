Vibe Code an App

In this mission you’ll take a repetitive, manual task you do, and vibe code an app that supports it using Google AI Studio. 

While a Google AI plan is not strictly required to complete this mission, it is highly recommended to enhance your learning experience:

Students: Eligible college students can claim one year of a Google AI plan free of charge. Claim your offer here.

Professionals: Not an eligible college student? You can still claim three months of a Google AI plan free of charge. See banner at the bottom of the screen. 

You’ll need: a Google account for Google AI Studio

What you'll learn

When building apps with AI, the first version is never the finished one. If the app doesn't do what you expected on the first try, don't worry, that's totally normal.

Here, you’ll practice a three-step workflow:

Plan and build your app: Clearly describe what you need and review Gemini’s plan before it generates any code. Once you’re happy with the plan, start building.

Debug your app: Test the app, identify what isn’t working, and ask Gemini to fix it. Catching problems early helps prevent bigger issues later.

Share your app: Share your app with a trusted user so both of you can use it for everyday tasks.

What you'll build

Create an app to help you tackle real tasks you're facing, whether that’s tracking application deadlines or coordinating a project. The app you create will also showcase your AI skills to potential employers.

Here’s what that looks like when it’s done:

How this mission works

Start here

Press “Talk” to speak with the AI Skills instructor. The session takes a few minutes to learn key concepts, and by the end of the conversation, you’ll have ideas for your app. When you’re done, go to Build. 

Vibe Code an App

Pick a repetitive, manual task you keep running into. It could be at a job, internship, in your job search, or in a student org. Vibe code an app that supports that work in Google AI Studio.

Step-by-step guide

Work through the steps in order and check each one off as you go to track your progress.

Quick review: The three phases of vibe coding

A single prompt can get you something that looks like an app. Getting to one you'd depend on takes a few more passes, and that work falls into three phases.

Plan and build it: Create a plan for your app before generating any code

State the problem and the real constraints, hand over any file(s) that hold the specifics, and let Gemini propose a plan. Read it and correct it before anything gets built. Fixing a plan is faster than fixing a finished build.

Debug it: Test your app, find what's broken, fix the issue and repeat

The first build is a draft. Run your actual task through it, tell Gemini exactly what went wrong. After it fixes the code, run it again. You’ll spend most of your time here.When a fix works, turn it into a standing rule so it holds next time.

Share it: Get it ready for someone else to use

Your build works for you because you know its workarounds. Someone opening it for the first time might not know about them. Add whatever a first-time user needs and clear out anything that can distract them. Give one person access before sharing with others.

As you test and debug, two things that will help you work towards a solid app:

Turn individual errors into permanent rules: Go beyond fixing individual bugs by setting rules so that the next time your app encounters that bug, it behaves as expected, every time.

Use version history to enable experimentation: If a change makes things worse, restoring an earlier version is faster and safer than prompting your way back. AI Studio keeps previous versions of your build in your Google Drive, so undoing your work is just a few clicks away. Use this safety net to experiment.

I. Plan it with Gemini

Note: You can check these off as you go to track your progress.

Think about a task you do often that's slow, repetitive, or easy to get wrong: something from your job or internship, your job search, a class project, or a student org you're part of. That's your starting point.

Ask the AI Skills Instructor to brainstorm with you. A few starting shapes that tend to work well: turning messy meeting or class notes into a task list, tracking job applications so nothing falls through, coordinating signups for a student org event, or turning a spreadsheet you already keep by hand into something that updates itself.

Open Google Gemini and start a new chat. Describe the problem and ask which part is worth building.

I'm a [your role, e.g. project manager, job seeker, club treasurer] and I want to build an app for a task I do often: [describe the task in a sentence or two]. Help me think through whether this is a good fit for an AI-built app, and why.

Start a new chat in Gemini and describe your app in four parts: inputs, process, output, and goal.

I want to build an app that takes [inputs, e.g. my class notes] and does [process, e.g. sorts out key terms and definitions] to create [output, e.g. flashcards] that helps me [goal, e.g. study for an exam]. Help me plan it out before we build anything, and interview me one question at a time for any details, rules, or likely mistakes I haven't mentioned yet.

You don’t have to accept the first suggestion. You can challenge the recommendations or ask for alternatives until you discover an idea you want to build.

Without your specifics, the plan stays generic. If you have a file that holds them, attach it: the spreadsheet you keep by hand, a doc with the rules or process, a sample of past work, an export from an app you already use. Use the + button to add it from your computer or Google Drive.

Use the attached file as context for the app we're planning. Based on what's actually in it, what should I be considering that I haven't mentioned?

No file like that on hand? Skip it, or type the background straight into the chat instead.

Only use data you're clearly allowed to use. Don't upload confidential, customer, or proprietary information to an outside app without permission, and check your employer's or school's data and AI policies first.

Once your plan holds up, ask Gemini to combine the whole conversation into a single prompt you can build from, and check it against your original goal.

Pull everything we've discussed into one clear prompt I can build from, including the plan, the rules we set, and how the app should be structured. Then review that prompt against my original goal: is anything missing, unclear, or contradictory, and does it still solve the problem I started with?

This build prompt is your plan. Read what it flags and decide what to change. You have the final say on what stays in.

II. Build it in Google AI Studio

Open Google AI Studio, go to New app and paste your build prompt into the description box.

As Gemini builds, it may pause partway through to check in on a decision it can't make without your input. Read what it's asking and answer it rather than accepting a default without looking.

The build takes a few minutes. What comes back is a working first version, or a prototype, so you should expect it to make mistakes.

Test your app with real inputs. Click through every button, view every screen, and compare what you expected against what it actually did.

Does it complete the main task, start to finish?

Does the output look correct and include everything it should?

Where does it guess instead of using your real information?

Keep a running list of what's broken or incorrect. You'll fix it next.

III. Debug it

If you spot a bug, describe the gap between what you wanted and what you got.

In [feature/screen], [what's wrong]. Please change it so [what you want instead].

Words aren't always the fastest way to describe a bug. You can try these instead:

Use images to describe the issue. Screenshot the problem, annotate what's wrong, and send that with your request. This is usually quicker than describing a layout issue in a sentence.

Ask the model to suggest options. When something bothers you but you can't say why: “Suggest three ways to improve this, with the trade-offs of each, so I can choose.”

Roll it back. If a change made things worse, restore an earlier version from your app's file in Google Drive rather than prompting your way back.

Add a rule. Some fixes are worth turning into a standing rule, so it holds on every run from here. Just tell Gemini: “From now on, always [the rule you want it to follow].”

IV. Share it

You know every workaround in your own build. Someone opening it for the first time might not. Try the following prompt in Google AI Studio:

Add a welcome message for first-time users that explains what this app does, its main features, and where to start. Then hide or remove anything that only helped while building, like test data, placeholder text, or technical error logs.

Then tailor the opening view. If your user cares about one thing, open straight to it and use plain labels instead of your own shorthand: 

Add a view for [who] showing [what they care about], and set as the default.

The last move is to share your app with someone else.

Start with a soft launch. Open the share controls, set general access to Restricted: only people you specify, add one person, and watch them use it without your help. Then fix whatever trips them up before anyone else sees it.

Open your live link in a private browsing window to see exactly what a visitor sees. That link is your finished artifact: send it to a friend, drop it in a portfolio, or put it on an application.

Your app is done. Go to Submit project and share the link.

Enjoyed this mission? There’s more! Enroll in the Google AI Professional Certificate and build 20+ job-ready solutions to showcase your new skills.

