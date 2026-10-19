# S30 Ledger, full-night draft

Status: content draft, 19 Oct 2026. Not in the app yet. Replaces the four-line cards with a night's log per agent in the texture of each job, so the decisive lines sit among routine ones.

Design rules used:

- Every agent has 16 to 19 lines per layer, 6 PM to 4 AM, in their own job's vocabulary.
- Every agent has exactly one secret in Layer 02 and one or two mildly odd routine lines, so density is never a tell.
- Layer 01 is what they wrote; Layer 02 is what the systems recorded. Most lines agree. Each agent's Layer 02 has one gap or difference. Nina's is the only one that places her at the scene at 2:14.
- The compound: main building (ops floor, analysis wing, archives on B1, server room, security control room, armoury, mess, gym on the lower level), the secure safehouse in the inner compound with the Director's Office, the perimeter (north gate, west perimeter road, the restricted equipment storage facility on the storage road, east fence), and the motor pool. Celeste's diplomatic residence is across town.
- Cross-references hold across agents: shared meals, radio checks, badge-outs, meetings with Pendelton.

Incident (Layer 02 header): Murder of Arthur Pendelton. Confirmed time of death 2:14 AM. Location: Director's Office, secure safehouse. Found 4:15 AM by duty officer Hale on the hourly round.

---

## S30-001 Mara Voss, Security Director

**Profile.** A veteran of Section 30, Mara has overseen internal security for over 15 years. Known for her strict adherence to protocol, she rarely trusts anyone outside her department. She maintains a collection of antique military memorabilia in her office.

### Layer 01, self-reported

```
6:00 PM   Shift handover from day security. Nothing outstanding.
6:30 PM   Met Pendelton in his office. Weekly security review.
7:10 PM   Walked the inner compound. Safehouse doors and locks checked.
8:00 PM   Reviewed visitor list for tomorrow's liaison meeting.
9:10 PM   Mess with the night shift.
9:45 PM   Signed the armoury count. R-14 still out to Blackwood since 6:40.
10:45 PM  Inspected security systems. Camera 7 (storage road) flickering; ticket raised.
11:30 PM  Approved Mercer's overnight maintenance window on the servers.
12:00 AM  Perimeter round with the night guard. All gates secure.
12:30 AM  Radio check with Blackwood before his patrol.
1:00 AM   Paperwork in my office.
1:50 AM   Entered security control room.
2:00–2:30 AM  Reviewing surveillance footage, camera 7 fault.
2:35 AM   Returned to my office.
3:00 AM   Began the overnight incident summary. Nothing to report.
3:45 AM   Rounds to the north gate and back.
4:15 AM   Called to the safehouse by duty officer Hale.
```

### Layer 02, recorded

```
6:02 PM   Badge: security control room, in.
6:31 PM   Badge: Director's Office, in. Out 7:04 PM.
7:12 PM   Badge: safehouse inner door, in. Out 7:40 PM.
9:08 PM   Badge: mess, in.
9:47 PM   Armoury count countersigned. R-14 out to S30-004 since 6:41 PM.
10:46 PM  Control room terminal: camera 7 diagnostic run. Fault logged.
11:32 PM  Maintenance window MW-2291 approved, requester S30-002.
12:03 AM  Badge: north gate pedestrian door, out. In 12:26 AM.
12:31 AM  Radio: check-in with unit 2 (S30-004), channel 3.
1:04 AM   Badge: Security Director's office, in.
1:50 AM   Badge: security control room, in.
2:08 AM   Logged into surveillance terminal.
2:09 AM   Personnel database: restricted file PF-0412 opened. Clearance override used.
2:14 AM   Surveillance system recorded active monitoring, cameras 6 to 9.
2:21 AM   Personnel database: PF-0412 closed.
2:32 AM   Exited security control room.
3:02 AM   Document created: Overnight Incident Summary (empty).
3:46 AM   Badge: north gate pedestrian door, out. In 4:02 AM.
4:16 AM   Badge: safehouse inner door, in.
```

**Recovered evidence.** Security master keycard. Antique pocket watch. Folding utility knife. Security inspection checklist.

**Additional findings.** Security records indicate Mara accessed a restricted personnel file at 2:09 AM, despite claiming she was only reviewing surveillance footage. The file concerned an internal disciplinary investigation unrelated to Pendelton.

---

## S30-002 Elias Mercer, Systems Architect

**Profile.** Elias helped design the original S30 Ledger infrastructure. Brilliant but absent-minded, he prefers working alone and has a habit of repairing outdated equipment rather than replacing it. He collects vintage fountain pens and mechanical writing instruments.

### Layer 01, self-reported

```
6:20 PM   Arrived. Coffee. Read overnight alerts from the Ledger cluster.
7:15 PM   Worked in the server room. Replaced a failing drive in rack 3.
8:40 PM   Rebuilt the array. Waited for the parity check.
9:30 PM   Ate at my desk.
10:20 PM  Wrote the upgrade proposal for the archive indexer.
11:30 PM  Met Pendelton about system upgrades. He wants the indexer done this quarter.
12:10 AM  Packed up. Left the proposal on his desk.
12:40 AM  Left headquarters. Drove home.
1:10 AM   Home. Tea.
1:40 AM   Began server maintenance from my home workstation.
2:00–2:30 AM  Working remotely from home. Patching the archive nodes.
2:45 AM   Patching complete. Reboot cycle.
3:00 AM   Watched the nodes come back. All green.
3:20 AM   Logged off. Bed.
```

### Layer 02, recorded

```
6:18 PM   Badge: main entrance, in.
7:14 PM   Badge: server room, in.
7:31 PM   Rack 3, bay 6: drive removed. 7:36 PM: drive inserted.
8:41 PM   Array rebuild started, estimated 2 h 50 m.
10:22 PM  Document created: Archive Indexer Upgrade Proposal.
11:28 PM  Badge: Director's Office, in. Out 11:52 PM.
12:09 AM  Badge: server room, in. Out 12:14 AM.
12:41 AM  Badge: main entrance, out. Motor pool gate: personal vehicle out 12:44 AM.
12:58 AM  Home router: workstation online.
1:40 AM   Remote session opened to archive node cluster.
1:52 AM   Patch set AR-114 applied to node 1.
2:06 AM   Authenticated remote connection from residence (re-auth on token expiry).
2:14 AM   Active remote maintenance session, node 3 patching.
2:17 AM   File transfer: 41 archived documents, project folder HALCYON, to USB device (personal). Not authorized.
2:38 AM   Disconnected from server.
2:46 AM   Reboot cycle started by scheduled job.
3:04 AM   All archive nodes reporting healthy.
3:19 AM   Home router: workstation offline.
```

**Recovered evidence.** Encrypted USB drive. Vintage fountain pen. Precision screwdriver set. Server access keycard.

**Additional findings.** System logs show Elias copied several archived technical documents onto his personal encrypted USB drive at 2:17 AM. The documents appear to be schematics for an abandoned Section 30 project. The transfer was not authorized.

---

## S30-003 Nina Calder, Intelligence Analyst

**Profile.** Nina specializes in decoding encrypted communications and analyzing intelligence reports. She joined Section 30 following her brother's death during a classified operation. Quiet and observant, she is known for keeping detailed handwritten notes and rarely forgetting a conversation.

### Layer 01, self-reported

```
6:15 PM   Analysis wing. Picked up the overnight decrypt queue.
7:00 PM   Decrypt batch 1 of 3. Routine traffic.
8:00 PM   Reviewed classified mission files for the quarterly audit.
9:00 PM   Mess. Alone.
9:40 PM   Decrypt batch 2 of 3.
10:30 PM  Pulled three files from the archives for the audit.
11:20 PM  Discussed an investigation with Pendelton.
12:00 AM  Back in the analysis wing. Wrote up the audit notes.
12:50 AM  Decrypt batch 3 of 3. One malformed message, flagged.
1:30 AM   Returned the audit files to the archives.
1:55 AM   Passed the safehouse on the way back from the archives.
2:00–2:30 AM  Working in the archives. Re-shelving and cross-referencing.
2:40 AM   Analysis wing. Closed out the decrypt queue.
3:15 AM   Filed the audit notes.
3:40 AM   Left for the night.
```

### Layer 02, recorded

```
6:14 PM   Badge: analysis wing, in.
7:02 PM   Decrypt terminal: batch DQ-771 opened. Closed 7:48 PM.
8:03 PM   Classified files reading room: 4 files signed out. Returned 8:55 PM.
8:58 PM   Badge: mess, in.
9:41 PM   Decrypt terminal: batch DQ-772 opened. Closed 10:20 PM.
10:31 PM  Badge: archives B1, in. 3 files signed out. Out 10:49 PM.
11:18 PM  Badge: Director's Office, in. Out 11:57 PM.
12:02 AM  Badge: analysis wing, in.
12:51 AM  Decrypt terminal: batch DQ-773 opened. Flag raised on message 14. Closed 1:26 AM.
1:31 AM   Badge: archives B1, in. 3 files returned. Out 1:49 AM.
1:55 AM   Camera 3: seen approaching the safehouse inner door.
2:11 AM   Badge: Director's Office, in.
2:14 AM   Confirmed inside the office.
2:19 AM   Badge: Director's Office, out. Camera 3: toward the archives stair.
2:22 AM   Badge: archives B1, in. Out 2:38 AM.
2:41 AM   Badge: analysis wing, in.
3:14 AM   Document saved: Quarterly Audit Notes.
3:41 AM   Badge: main entrance, out.
```

**Recovered evidence.** Leather-bound notebook. Encrypted flash drive. Silver letter opener. Photograph of her brother.

**Additional findings.** Nina's personal notebook contains several pages of handwritten notes about a classified operation from three years earlier. The operation was officially closed, but Nina had continued researching it without authorization.

---

## S30-004 Theo Blackwood, Field Operative

**Profile.** A decorated field operative, Theo specializes in reconnaissance and extraction missions. He spent two years missing in action before returning to Section 30. He is highly resourceful, skilled with improvised tools, and prefers fieldwork over administrative duties.

### Layer 01, self-reported

```
6:10 PM   Vehicle check, patrol unit 2. Fuel, radio, body camera battery.
6:40 PM   Armoury: signed out handheld radio R-14.
7:45 PM   Returned to headquarters from the Ridgeway reconnaissance.
8:30 PM   Filed the reconnaissance summary.
9:15 PM   Mess. Ate with the night shift.
10:15 PM  Met Pendelton for a mission debriefing.
11:05 PM  Gym, lower level.
11:50 PM  Prepared the patrol route: north gate, west perimeter, storage road, east fence.
12:30 AM  Radio check with security control.
1:30 AM   Departed on security patrol.
1:40 AM   North gate, clear.
2:00–2:30 AM  Vehicle GPS places him outside the safehouse, west perimeter.
2:50 AM   East fence, clear.
3:10 AM   Returned, logged mileage.
3:30 AM   Radio R-14 returned to armoury.
3:45 AM   Patrol report filed.
```

### Layer 02, recorded

```
6:08 PM   Motor pool: unit 2 checked out.
6:41 PM   Armoury log: R-14 issued to S30-004.
7:44 PM   Motor pool: unit 2 in. Mileage 61.
8:33 PM   Document created: Reconnaissance Summary, Ridgeway.
9:12 PM   Badge: mess, in.
10:14 PM  Badge: Director's Office, in. Out 10:58 PM.
11:06 PM  Badge: lower level gym, in. Out 11:47 PM.
12:31 AM  Radio: check-in with security control, channel 3.
1:30 AM   Departed headquarters in patrol vehicle.
1:39 AM   GPS: north gate.
1:47 AM   GPS: stopped, restricted equipment storage facility. Stationary 8 min.
1:56 AM   GPS: storage road, moving.
2:05 AM   Vehicle recorded at western perimeter.
2:14 AM   Body camera recorded an active perimeter inspection, west fence.
2:33 AM   GPS: west perimeter, moving.
2:41 AM   Returned to headquarters. Motor pool: unit 2 in. Mileage 67.
2:52 AM   GPS: unit 2 out again. East fence 2:58 AM. In 3:09 AM.
3:31 AM   Armoury log: R-14 returned.
3:47 AM   Document created: Patrol Report.
```

**Recovered evidence.** Tactical flashlight. Combat knife. Military identification tags. Handheld radio.

**Additional findings.** Theo's patrol report omitted an unscheduled stop at 1:47 AM near a restricted equipment storage facility. Vehicle GPS confirms he remained there for approximately eight minutes before continuing his patrol.

---

## S30-005 Celeste Rowan, Diplomatic Liaison

**Profile.** Celeste manages Section 30's international intelligence partnerships. Fluent in six languages, she is known for her diplomatic charm and extensive network of contacts. She frequently exchanges handwritten correspondence and keeps a personalized stationery set in her office.

### Layer 01, self-reported

```
6:00 PM   Attended the executive briefing.
6:50 PM   Office. Replied to three partner services by letter.
7:40 PM   Call with the Lisbon desk. Scheduling.
8:30 PM   Prepared the brief for tomorrow's liaison meeting.
9:20 PM   Mess, briefly.
10:30 PM  Met privately with Pendelton. Partner matters.
11:15 PM  Office. Sealed the diplomatic pouch for the morning courier.
11:50 PM  Changed for the evening meeting.
12:45 AM  Left for a diplomatic meeting.
1:15 AM   Driver. Across town.
2:00–2:30 AM  Attending a meeting across town.
3:00 AM   Meeting continued. Routine intelligence briefing.
3:30 AM   Departed. Home.
```

### Layer 02, recorded

```
5:58 PM   Badge: briefing room, in. Out 6:44 PM.
6:52 PM   Badge: liaison office, in.
7:41 PM   Secure line: outbound, Lisbon, 22 min.
9:18 PM   Badge: mess, in. Out 9:31 PM.
10:29 PM  Badge: Director's Office, in. Out 11:08 PM.
11:16 PM  Diplomatic pouch log: pouch DP-3310 sealed, courier 7:00 AM.
11:52 PM  Badge: liaison office, out. Residence wing.
12:45 AM  Departed headquarters. Motor pool: car 1 with driver.
1:03 AM   Car 1 GPS: city centre.
1:58 AM   Arrived at diplomatic residence.
2:14 AM   Security cameras recorded her attending a meeting, residence reception room.
2:40 AM   Residence visitor book: two guests, no names, "trade delegation".
2:47 AM   Departed diplomatic residence.
3:05 AM   Car 1 GPS: city centre.
3:28 AM   Car 1 GPS: Rowan residence. Driver returns car 1 to motor pool 3:55 AM.
```

**Recovered evidence.** Diplomatic identification card. Engraved fountain pen. Sealed diplomatic envelope. Small pair of stationery scissors.

**Additional findings.** Celeste's diplomatic meeting was officially registered as a routine intelligence briefing. However, recovered communications indicate the meeting was actually a private negotiation concerning an unauthorized exchange of intelligence materials.

---

## Notes for the ARCHIVE in this version

With logs this size the ARCHIVE earns its keep as retrieval: by agent, by time window, by place (safehouse, archives, server room, perimeter) and by keyword (radio, badge, file, pouch). It still never compares, judges or names. A reply lists matching lines, one per line, and stops.

Questions worth testing against it once built: "who badged into the safehouse after midnight", "everything on Theo between 1:30 and 2:30", "any record mentioning the archives after 1 AM", "who met Pendelton tonight and when".

## Known soft spots

- Nina's Layer 01 has her "pass the safehouse" at 1:55, which she needs because camera 3 sees her; it is the one line in her self-report that a careful reader could use against her before Layer 02. It is there so her account is a lie of omission, not a fabrication, and so an actor playing her has something to say.
- Celeste's 3:00 AM "meeting continued" versus her 2:47 departure is a second small discrepancy on top of her secret. Remove it if one secret per agent should be strict.
- Elias's Layer 01 says he "left the proposal on his desk" at 12:10; Layer 02 has him badge into the server room then, not the office. Harmless, but an actor should know.

## Simulation, 19 Oct 2026

Two passes by a fast model with no extended thinking, playing Jimmy. Pass 1 saw Layer 01 only; pass 2 saw both layers plus its own pass-1 notes and the actors' table answers (assumed to stick to their logs).

**Pass 1 (Layer 01 only).** Ranking: Mara, Theo, Elias, Nina, Celeste. Gut call Mara at 30 percent, on the camera 7 fault she raised herself and her self-reviewed half hour. Nina's 1:55 "passed the safehouse" was noticed but ranked fourth. ARCHIVE queries it wanted: camera 7 events, control room 1:45 to 2:40, the R-14 radio, Mercer's remote sessions, safehouse badge events 2:00 to 2:30. It caught a real inconsistency in the draft (Theo's radio out at 6:40 against Mara's "one radio out" at 9:45), fixed above.

**Pass 2 (both layers).** Read every line. Found all five discrepancies. Deduction: 2:14 AM, Nina Calder, the silver letter opener. Settled by pairing her 2:11 to 2:19 office badges with the 2:14 time of death against her claim of the archives. Rated 6 of 10 for a guest with a drink. The Elias 2:17 USB transfer cost the most time, "looked like the main crime until the 2:14 time of death ruled him out." Flagged as author-pointing: the LETTER OPENER tiles, the silver letter opener among her belongings, and the "2:14 Confirmed inside the office" line, "unusually precise for a log entry."

**Misses.** Motive came out as the brother's closed operation (revenge), not the syndicate sale, and the asset as "the classified operation files", not the hard copy of the Ledger. Neither the syndicate nor the hard copy appears anywhere in either layer; they live only in the intro letter. The ARCHIVE queries it wrote were precise record lookups (file PF-0412 access, Director's Office badges 2:00 to 2:30, HALCYON transfers), which is the retrieval role.

**Takeaways.**
1. Layer 01 does not leak. Layer 02 solves it in one careful read. The red herrings work, Elias best.
2. Replace "2:14 AM Confirmed inside the office" with a natural record, for example `2:13 AM Director's desk terminal unlocked with Director's credentials` and `2:19 AM Badge: Director's Office, out`, so the time of death is matched by inference rather than stated.
3. Decide whether motive and asset should be deducible from the records or remain the intro letter's gift. If deducible, Nina's Layer 02 needs one trace of the syndicate or the hard copy (a line in her findings, or on the encrypted flash drive), and the grader's motive slot should then accept the brother's operation as a wrong answer rather than a near miss.
4. The ARCHIVE as retrieval over these logs is what the player reached for unprompted: by file id, by place and window, by keyword.
