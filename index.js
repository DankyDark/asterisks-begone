import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
const extensionName = "asterisks-begone";
const defaultSettings = {
  enabled: true,
  checkForCharacterActions: true, // When true, will check if text contains character actions before removing asterisks
};

let buttonAdded = false;
let isAddingButton = false;
let buttonAddTimeout = null;

extension_settings[extensionName] = extension_settings[extensionName] || {};
if (!extension_settings[extensionName].hasOwnProperty("enabled")) {
  extension_settings[extensionName].enabled = defaultSettings.enabled;
  saveSettingsDebounced();
}
if (!extension_settings[extensionName].hasOwnProperty("checkForCharacterActions")) {
  // Initialize the checkForCharacterActions setting if it doesn't exist
  extension_settings[extensionName].checkForCharacterActions = defaultSettings.checkForCharacterActions;
  saveSettingsDebounced();
}

async function addSettings() {
  try {
    const response = await fetch(
      `/scripts/extensions/third-party/${extensionName}/index.html`
    );
    if (!response.ok) {
      console.error(
        `[${extensionName}] Error loading settings HTML:`,
        response.statusText
      );
      return;
    }

    const html = await response.text();
    $("#extensions_settings").append(html);

    $("#asterisks-begone-enabled").prop(
      "checked",
      extension_settings[extensionName].enabled
    );

    $("#asterisks-begone-check-actions").prop(
      "checked",
      extension_settings[extensionName].checkForCharacterActions
    );

    $("#asterisks-begone-enabled").on("change", function () {
      extension_settings[extensionName].enabled = !!$(this).prop("checked");
      saveSettingsDebounced();

      if (extension_settings[extensionName].enabled) {
        checkAndAddButton();
      } else {
        $(".asterisks-begone-button").remove();
        buttonAdded = false;
      }
    });

    $("#asterisks-begone-check-actions").on("change", function () {
      extension_settings[extensionName].checkForCharacterActions = !!$(this).prop("checked");
      saveSettingsDebounced();
    });
  } catch (error) {
    console.error(`[${extensionName}] Error adding settings:`, error);
  }
}

function checkAndAddButton() {
  if (buttonAddTimeout) {
    clearTimeout(buttonAddTimeout);
    buttonAddTimeout = null;
  }

  buttonAddTimeout = setTimeout(() => {
    if (isAddingButton) return;

    try {
      isAddingButton = true;

      $(".asterisks-begone-button").remove();

      if (!extension_settings[extensionName].enabled) {
        buttonAdded = false;
        isAddingButton = false;
        return;
      }

      if ($(".asterisks-begone-button").length > 0) {
        buttonAdded = true;
        isAddingButton = false;
        return;
      }

      const firstMessageLabel = $('div:contains("First message")').filter(
        function () {
          return $(this).text().trim() === "First message";
        }
      );

      const button = $("<input>", {
        type: "button",
        id: "asterisks-begone-button",
        class: "menu_button asterisks-begone-button",
        value: "Asterisks Begone",
        style:
          "display: inline-block !important; visibility: visible !important; opacity: 1 !important;",
        click: removeAsterisks,
      });

      if (firstMessageLabel.length) {
        button.insertAfter(firstMessageLabel);
        buttonAdded = true;
        console.log("[Asterisks-Begone] Loaded.");
      } else {
        console.log("[Asterisks-Begone] Could not load.");
      }
    } finally {
      isAddingButton = false;
    }
  }, 100);
}

// Function to detect if text has legitimate character actions
// Returns true if we should preserve the asterisks, false if we should clean them up
function hasCharacterActions(text) {
  if (!text) return false;
  
  // Debug info for troubleshooting
  const debug = {
    reason: "",
    originalText: text.substring(0, 100) + (text.length > 100 ? "..." : "")
  };
  
  // Track if we've already decided based on a high-priority rule
  let hasHighPriorityDecision = false;
  let shouldCleanup = false;
  let finalDecision = null; // Track the final decision explicitly
  
  // If the entire text is wrapped in asterisks, it's not character actions
  if (text.startsWith('*') && text.endsWith('*') && text.indexOf('*', 1) === text.length - 1) {
    debug.reason = "Entire text is wrapped in asterisks";
    console.log("[Asterisks-Begone] " + debug.reason, { text });
    finalDecision = false; // false = clean up
    return finalDecision;
  }
  
  // First, let's check the paragraph pattern - this is a more reliable indicator
  const paragraphs = text.split(/\n+/).filter(p => p.trim() !== '');
  if (paragraphs.length > 1) {
    const wrappedParagraphs = paragraphs.filter(p => {
      const trimmed = p.trim();
      return trimmed.startsWith('*') && trimmed.endsWith('*');
    }).length;
    
    const wrappedRatio = wrappedParagraphs / paragraphs.length;
    
    // Log paragraph structure for debugging
    console.log("[Asterisks-Begone] Paragraph analysis:", {
      total: paragraphs.length,
      wrapped: wrappedParagraphs,
      ratio: wrappedRatio,
      paragraphs: paragraphs.map(p => ({
        starts: p.trim().startsWith('*'),
        ends: p.trim().endsWith('*'),
        length: p.length
      }))
    });
    
    if (wrappedRatio > 0.5) { // If more than half of paragraphs are wrapped
      debug.reason = `Most paragraphs (${Math.round(wrappedRatio * 100)}%) are wrapped in asterisks`;
      console.log("[Asterisks-Begone] " + debug.reason, { 
        paragraphs: paragraphs.length,
        wrappedParagraphs,
        wrappedRatio
      });
      
      // Mark this as a high-priority decision
      hasHighPriorityDecision = true;
      shouldCleanup = true;
      
      // Skip additional checks if this is a very clear case (>60% wrapped)
      if (wrappedRatio > 0.6) {
        console.log("[Asterisks-Begone] High wrapping ratio detected, cleaning up without further analysis");
        finalDecision = false; // false = clean up
        return finalDecision;
      }
    }
  }
  
  // Check if all non-dialogue sections are wrapped in asterisks by using a more precise approach
  
  // Step 1: Identify dialogue text (in quotes)
  // Using a more comprehensive regex that handles common dialogue patterns
  const dialogueRegex = /["'][^"']+["']|["'].*?["']/g; // Improved to match various dialogue formats
  const dialogueMatches = text.match(dialogueRegex) || [];
  
  // Create a marked version of the text to analyze section patterns
  let markedText = text;
  for (const match of dialogueMatches) {
    markedText = markedText.replace(match, "###DIALOGUE###");
  }
  
  // Split by dialogue markers to get non-dialogue sections
  const sections = markedText.split("###DIALOGUE###").filter(s => s.trim() !== "");
  
  console.log("[Asterisks-Begone] Section analysis:", {
    sectionCount: sections.length,
    sections: sections.map(s => s.substring(0, 30) + (s.length > 30 ? "..." : ""))
  });
  
  // Check if all non-dialogue sections are wrapped in asterisks
  const allNonDialogueSectionsWrapped = sections.every(section => {
    const trimmed = section.trim();
    
    // Empty sections or sections with only formatting characters don't count
    if (trimmed === "" || /^[\s\n,.;:!?"'-]+$/.test(trimmed)) return true;
    
    // Check if this section is fully wrapped in asterisks
    const isWrapped = trimmed.startsWith('*') && trimmed.endsWith('*');
    
    // Allow sections without asterisks to pass
    const hasAsterisks = trimmed.includes('*');
    
    return isWrapped || !hasAsterisks;
  });
  
  if (sections.length > 0 && allNonDialogueSectionsWrapped) {
    debug.reason = "All non-dialogue sections appear to be wrapped in asterisks";
    console.log("[Asterisks-Begone] " + debug.reason, { sections });
    
    // If we don't already have a high-priority decision, make one now
    if (!hasHighPriorityDecision) {
      hasHighPriorityDecision = true;
      shouldCleanup = true;
    }
    
    // Return early if we've already decided to clean up
    if (shouldCleanup) {
      console.log("[Asterisks-Begone] All non-dialogue sections wrapped, cleaning up");
      finalDecision = false; // false = clean up
      return finalDecision;
    }
  }
  
  // Special check for the pattern where all descriptive paragraphs are fully wrapped in asterisks
  // and there's a mix of dialogue and descriptive text - this pattern should be cleaned up
  if (dialogueMatches.length > 0 && paragraphs.length > 3) {
    // Classify paragraphs as descriptive or dialogue
    const descriptiveParagraphs = paragraphs.filter(p => {
      const trimmed = p.trim();
      // Does not contain a quote but contains an asterisk
      return !trimmed.includes('"') && !trimmed.includes("'") && trimmed.includes('*');
    });
    
    // Check if all descriptive paragraphs are fully wrapped in asterisks
    if (descriptiveParagraphs.length > 0) {
      const fullyWrappedDescriptive = descriptiveParagraphs.filter(p => {
        const trimmed = p.trim();
        return trimmed.startsWith('*') && trimmed.endsWith('*');
      }).length;
      
      const descriptiveWrappedRatio = fullyWrappedDescriptive / descriptiveParagraphs.length;
      
      console.log("[Asterisks-Begone] Descriptive paragraph analysis:", {
        total: descriptiveParagraphs.length,
        wrapped: fullyWrappedDescriptive,
        ratio: descriptiveWrappedRatio
      });
      
      // If almost all descriptive paragraphs are fully wrapped, clean up regardless of other factors
      if (descriptiveWrappedRatio > 0.9) {
        debug.reason = "Almost all descriptive paragraphs are fully wrapped in asterisks in a mixed format";
        console.log("[Asterisks-Begone] " + debug.reason, { 
          descriptiveParagraphs: descriptiveParagraphs.length,
          fullyWrappedDescriptive,
          descriptiveWrappedRatio
        });
        
        // This pattern indicates formatting style rather than true character actions
        finalDecision = false; // false = clean up
        return finalDecision;
      }
    }
  }
  
  // Standard analysis below - keep as fallback
  // Step 2: Remove dialogue from text to focus on non-dialogue parts
  let nonDialogueText = text;
  for (const match of dialogueMatches) {
    nonDialogueText = nonDialogueText.replace(match, ' ');
  }
  
  // Step 3: Find all asterisk-wrapped sections
  const asteriskWrappedRegex = /\*[^*]+\*/g;
  const asteriskWrappedSections = nonDialogueText.match(asteriskWrappedRegex) || [];
  
  // Step 4: Remove asterisk-wrapped sections
  let remainingText = nonDialogueText;
  for (const section of asteriskWrappedSections) {
    remainingText = remainingText.replace(section, ' ');
  }
  
  // Step 5: Clean up remaining text and check if anything substantial is left
  remainingText = remainingText.replace(/\*/g, '').trim(); // Remove any stray asterisks
  
  // Remove templating variables, special tokens, and formatting artifacts
  const cleanedRemainingText = remainingText
    .replace(/{{[^}]+}}/g, '') // Remove template variables like {{user}}, {{char}}
    .replace(/<[^>]+>/g, '') // Remove special tokens like <START>
    .replace(/[\s,.;:!?'"\-_—–()[\]{}]+/g, '') // Remove punctuation and whitespace
    .replace(/\s+/g, ''); // Remove any remaining whitespace
  
  // Log for debugging
  console.log("[Asterisks-Begone] Plain text analysis:", {
    raw: remainingText,
    cleaned: cleanedRemainingText,
    rawLength: remainingText.length,
    cleanedLength: cleanedRemainingText.length,
    containsTemplateVars: /{{[^}]+}}/.test(remainingText),
    containsSpecialTokens: /<[^>]+>/.test(remainingText)
  });
  
  // If the dialogueMatches length is high and we have substantial remaining text,
  // this might be a case where dialogue wasn't properly detected
  if (dialogueMatches.length > 3 && cleanedRemainingText.length > 30) {
    // Check if the remaining text looks like missed dialogue
    const potentialDialogueFragments = remainingText.split(/[.!?]+/).filter(f => f.trim().length > 10);
    
    if (potentialDialogueFragments.length > 0) {
      console.log("[Asterisks-Begone] Detected potential missed dialogue fragments:", {
        fragments: potentialDialogueFragments.map(f => f.trim().substring(0, 30) + (f.length > 30 ? "..." : ""))
      });
      
      // If this looks like dialogue that wasn't wrapped in quotes, it's probably
      // a case where the text uses asterisks for everything except dialogue
      if (text.indexOf('*') === 0 && text.lastIndexOf('*') === text.length - 1) {
        debug.reason = "Text contains dialogue not wrapped in quotes but wrapped in asterisks";
        console.log("[Asterisks-Begone] " + debug.reason);
        
        // If we don't already have a high-priority decision, make one now
        if (!hasHighPriorityDecision) {
          finalDecision = false; // false = clean up
          return finalDecision;
        }
      }
    }
  }
  
  // If we already made a high-priority decision based on paragraph analysis or sections,
  // use that instead of the plain text analysis
  if (hasHighPriorityDecision) {
    debug.reason = "Using high-priority rule result: " + (shouldCleanup ? "clean up" : "preserve");
    console.log("[Asterisks-Begone] " + debug.reason);
    finalDecision = !shouldCleanup; // Return the opposite of shouldCleanup (false = clean up, true = preserve)
    return finalDecision;
  }
  
  // Check if we have a high number of newlines and asterisks in the text, which might indicate
  // formatting needs cleaning up even if not caught by the paragraph analysis
  const newlineCount = (text.match(/\n/g) || []).length;
  const asteriskCount = (text.match(/\*/g) || []).length;
  
  if (newlineCount > 10 && asteriskCount > 10) {
    const textWithoutDialogue = nonDialogueText.trim();
    const textWithoutDialogueAsterisks = textWithoutDialogue.replace(/\*/g, '').trim();
    
    // If removing asterisks from non-dialogue text significantly reduces content,
    // it suggests the text is heavily wrapped in asterisks
    if (textWithoutDialogue.length > 0 && 
        textWithoutDialogueAsterisks.length < textWithoutDialogue.length * 0.7) {
      debug.reason = "Text has high newline and asterisk count, and removing asterisks significantly reduces content";
      console.log("[Asterisks-Begone] " + debug.reason, {
        newlineCount,
        asteriskCount,
        originalLength: textWithoutDialogue.length,
        withoutAsterisksLength: textWithoutDialogueAsterisks.length,
        ratio: textWithoutDialogueAsterisks.length / textWithoutDialogue.length
      });
      finalDecision = false; // Clean up asterisks
      return finalDecision;
    }
  }
  
  // If we have significant MEANINGFUL text outside of both dialogue and asterisk-wrapped sections,
  // this suggests mixed formatting (likely real character actions)
  if (cleanedRemainingText.length > 10) {
    // Extra check: if the remaining text contains a lot of template formatting or special patterns,
    // it might not be real plain text but formatting artifacts
    const suspiciousPatterns = [
      'START', 'END', 'SYS', 'USER', 'CHAR',  // Common tokens
      'user', 'char', 'assistant', 'message'  // Common template variable content
    ];
    
    // Check if the cleaned text mostly consists of system tokens/variables
    const isMostlySystemContent = suspiciousPatterns.some(pattern => 
      cleanedRemainingText.toLowerCase().includes(pattern.toLowerCase())
    );
    
    if (isMostlySystemContent) {
      debug.reason = "Found template variables or system tokens, not legitimate plain text";
      console.log("[Asterisks-Begone] " + debug.reason, {
        cleanedText: cleanedRemainingText
      });
      finalDecision = false; // Safe to clean up
      return finalDecision;
    }
    
    debug.reason = "Found substantial plain text outside of dialogue and asterisk-wrapped sections";
    console.log("[Asterisks-Begone] " + debug.reason, { 
      textLength: text.length,
      dialogueCount: dialogueMatches.length,
      asteriskSectionCount: asteriskWrappedSections.length,
      remainingTextLength: cleanedRemainingText.length
    });
    finalDecision = true; // Preserve asterisks
    return finalDecision;
  }
  
  // If we have just a small amount of text, it's likely just formatting artifacts
  if (cleanedRemainingText.length > 0) {
    debug.reason = "Found minimal plain text, likely just formatting artifacts";
    console.log("[Asterisks-Begone] " + debug.reason, {
      plainTextLength: cleanedRemainingText.length,
      plainText: cleanedRemainingText
    });
  }
  
  // By default, if there's no significant plain text and we didn't already return,
  // assume it's safe to clean up
  debug.reason = "No significant plain text found outside of dialogue and asterisk-wrapped sections";
  console.log("[Asterisks-Begone] " + debug.reason);
  finalDecision = false; // Clean up asterisks
  
  // Final debugging message to confirm the decision
  console.log(`[Asterisks-Begone] Final decision: ${finalDecision ? "preserve" : "clean up"}`);
  return finalDecision;
}

async function removeAsterisks() {
  try {
    const context = getContext();
    const characterId = context.characterId;

    if (!characterId) {
      toastr.info("No character selected");
      return;
    }

    const character = context.characters[characterId];
    if (!character) {
      console.error("[Asterisks-Begone] Character not found in context");
      toastr.error("Character data not found");
      return;
    }

    // We'll track which fields we've cleaned up
    let cleanedFields = [];
    let fieldsShouldBeCleaned = false;
    let hasChanges = false;

    // First pass: Check if ANY field should be cleaned up
    if (extension_settings[extensionName].checkForCharacterActions) {
      // Check example messages
      const examplesText = $("#mes_example_textarea").val();
      if (examplesText && !hasCharacterActions(examplesText)) {
        fieldsShouldBeCleaned = true;
        console.log("[Asterisks-Begone] Example messages should be cleaned up");
      }

      // Check first message
      const firstMessage = $("#firstmessage_textarea").val();
      if (firstMessage && !hasCharacterActions(firstMessage)) {
        fieldsShouldBeCleaned = true;
        console.log("[Asterisks-Begone] First message should be cleaned up");
      }

      // Check alternate greetings
      const alternateGreetings = character?.data?.alternate_greetings || [];
      for (let i = 0; i < alternateGreetings.length; i++) {
        const greeting = alternateGreetings[i];
        if (greeting && !hasCharacterActions(greeting)) {
          fieldsShouldBeCleaned = true;
          console.log(`[Asterisks-Begone] Alternate greeting ${i+1} should be cleaned up`);
          break; // No need to check others once we know we should clean up
        }
      }
    } else {
      // If not checking for character actions, we always clean up everything
      fieldsShouldBeCleaned = true;
    }

    if (!fieldsShouldBeCleaned) {
      toastr.warning("Character actions detected in all fields. No asterisks were removed.");
      toastr.info("Disable 'Check for character actions' in settings to clean up anyway.");
      console.log("[Asterisks-Begone] No fields should be cleaned up");
      return;
    }

    // Second pass: Clean up ALL fields since at least one should be cleaned
    console.log("[Asterisks-Begone] At least one field should be cleaned up, cleaning all fields");
    
    // Clean example messages
    const examplesText = $("#mes_example_textarea").val();
    if (examplesText) {
      const cleanedText = examplesText.replace(/\*/g, "");
      if (cleanedText !== examplesText) {
        $("#mes_example_textarea").val(cleanedText);
        cleanedFields.push("Example messages");
        hasChanges = true;
      }
    }

    // Clean first message
    const firstMessage = $("#firstmessage_textarea").val();
    if (firstMessage) {
      const cleanedText = firstMessage.replace(/\*/g, "");
      if (cleanedText !== firstMessage) {
        $("#firstmessage_textarea").val(cleanedText);
        cleanedFields.push("First message");
        hasChanges = true;
      }
    }

    // Clean alternate greetings
    const alternateGreetings = character?.data?.alternate_greetings || [];
    let altGreetingsChanged = false;
    
    const cleanedGreetings = alternateGreetings.map((greeting, index) => {
      if (!greeting) return greeting;
      
      const cleanedGreeting = greeting.replace(/\*/g, "");
      
      if (cleanedGreeting !== greeting) {
        cleanedFields.push(`Alternate greeting ${index + 1}`);
        altGreetingsChanged = true;
      }
      
      return cleanedGreeting;
    });

    if (altGreetingsChanged) {
      character.data.alternate_greetings = cleanedGreetings;
      hasChanges = true;

      if ($("#alternate_greetings_template").length) {
        $("#alternate_greetings_template").val(
          JSON.stringify(cleanedGreetings, null, 2)
        );
      }
    }

    // Display appropriate messages based on what we did
    if (hasChanges) {
      try {
        // Trigger changes to save
        const exampleTextarea = $("#mes_example_textarea");
        exampleTextarea.trigger("change");
        
        const firstMessageTextarea = $("#firstmessage_textarea");
        firstMessageTextarea.trigger("change");
        
        $("#create_button").trigger("click");
        
        // Show success message
        toastr.success("Asterisks, BEGONE!");
        console.log("[Asterisks-Begone] All fields cleaned:", cleanedFields);
      } catch (saveError) {
        console.error("[Asterisks-Begone] Save error:", saveError);
        toastr.error("Error saving changes: " + saveError.message);
        toastr.info("Please save the character manually to apply changes");
      }
    } else {
      // No changes at all
      toastr.info("No asterisks found to remove");
      console.log("[Asterisks-Begone] No asterisks found to remove");
    }
  } catch (error) {
    console.error("[Asterisks-Begone] Error removing asterisks:", error);
    toastr.error("Error: " + error.message);
  }
}

$(document).ready(function () {
  addSettings();

  $(document).on(
    "click",
    ".character_select, #rm_button_selected_ch",
    function () {
      setTimeout(checkAndAddButton, 300);
    }
  );

  $(document).on("click", ".advanced_button, .toggle_advanced", function () {
    setTimeout(checkAndAddButton, 300);
  });

  setTimeout(checkAndAddButton, 1000);
  setTimeout(checkAndAddButton, 2000);
});
