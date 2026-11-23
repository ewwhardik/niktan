# Problem validation

[Download the one-page Hackasol OI-01 summary](niktan-validation.pdf) · [Try NikTan](https://niktan.vercel.app/)

## Who waits, and what information is missing?

At one North Indian government teaching hospital, 255 outpatients reported an average of **242.8 minutes from arrival until the doctor called them** and **12.8 minutes in consultation**. The study used convenience sampling in May–June 2026. These figures describe that hospital. They establish the burden of waiting, without attributing the entire delay to queue order. [Kumari, IJCMPH (2026)](https://doi.org/10.18203/2394-6040.ijcmph20264093)

ABDM Scan & Share helps patients register. A registration token gives staff an arrival order. When a department uses that order alone, the next token tells the doctor little about urgency, symptoms or which measurements need a desk check. NikTan addresses that decision between registration and consultation. [Scan & Share programme](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2281466)

## What the prototype demonstrates

A patient consents, checks pulse and eyes, and describes symptoms on a phone. A full check adds vision and hearing. The Health Card explains the next action. Confirmed emergency flags surface a call to 108. Other patients can join a department queue, where staff see the reasons for priority and any missing measurements. Face video and eye images stay on the phone. Optional voice and document processing can use online providers.

In an idle General Medicine queue with 14 routine fixtures, a synthetic patient reporting three days of fever received token 15. Arrival order put **14 people ahead**. NikTan assigned the same token “See today” and placed **zero ahead**. This establishes the change in queue position. Patient outcomes and minutes saved in a hospital still require field measurement. [Executable benchmark](../apps/api/test/d1.test.mjs) · [Evaluation details](metrics.md)

## What people have reported

As of **23 November 2026**, the public API showed **3 screenings, 0 post-check survey ratings and 0 wait-time responses**. The separate Hackasol team review form had **0 public reviews**. The survey records last-visit wait and willingness to use the app. Team reviews describe features tried, ratings and remarks. Both are voluntary, and each has its own denominator. [Public survey aggregates](https://niktan-api.niktan.workers.dev/api/stats/public) · [Team reviews](https://niktan-api.niktan.workers.dev/api/reviews)

## Field validation still needed

The proposed pilot pairs an outpatient desk with a clinician. With consent, observe arrivals and calls, time intake with and without the pre-consult card, and ask patients and staff where the workflow helped or failed. Report sample sizes, wait by priority, routine-patient delays and skipped checks. Clinical assessment of screening flags is a separate task. [Model evaluation](model-card-anemia.md) · [Eye-screening limitations](eye-screening.md)
