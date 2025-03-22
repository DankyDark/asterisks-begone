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
  
  // If the entire text is wrapped in asterisks, it's not character actions
  if (text.startsWith('*') && text.endsWith('*') && text.indexOf('*', 1) === text.length - 1) {
    debug.reason = "Entire text is wrapped in asterisks";
    console.log("[Asterisks-Begone] " + debug.reason, { text });
    return false; // Definitive decision - clean up
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
      
      // Skip additional checks if this is a very clear case (>65% wrapped)
      if (wrappedRatio > 0.65) {
        return false; // Clean up asterisks immediately
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
      return false;
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
          return false; // Clean up asterisks
        }
      }
    }
  }
  
  // If we already made a high-priority decision based on paragraph analysis or sections,
  // use that instead of the plain text analysis
  if (hasHighPriorityDecision) {
    debug.reason = "Using high-priority rule result: " + (shouldCleanup ? "clean up" : "preserve");
    console.log("[Asterisks-Begone] " + debug.reason);
    return !shouldCleanup; // Return the opposite of shouldCleanup (false = clean up, true = preserve)
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
      return false; // Safe to clean up
    }
    
    debug.reason = "Found substantial plain text outside of dialogue and asterisk-wrapped sections";
    console.log("[Asterisks-Begone] " + debug.reason, { 
      textLength: text.length,
      dialogueCount: dialogueMatches.length,
      asteriskSectionCount: asteriskWrappedSections.length,
      remainingTextLength: cleanedRemainingText.length
    });
    return true; // Preserve asterisks
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
  return false; // Clean up asterisks
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

    // Check for character actions if the setting is enabled
    if (extension_settings[extensionName].checkForCharacterActions) {
      const examplesText = $("#mes_example_textarea").val();
      const firstMessage = $("#firstmessage_textarea").val();
      const alternateGreetings = character?.data?.alternate_greetings || [];
      
      // Track which fields have character actions
      const actionsInExamples = examplesText && hasCharacterActions(examplesText);
      const actionsInFirstMessage = firstMessage && hasCharacterActions(firstMessage);
      const actionsInAlternateGreetings = alternateGreetings.some(greeting => hasCharacterActions(greeting));
      
      // Check all text content for character actions
      if (actionsInExamples || actionsInFirstMessage || actionsInAlternateGreetings) {
        // Building a more descriptive message about where actions were found
        let detectedIn = [];
        if (actionsInExamples) detectedIn.push("example messages");
        if (actionsInFirstMessage) detectedIn.push("first message");
        if (actionsInAlternateGreetings) detectedIn.push("alternate greetings");
        
        const locationMessage = detectedIn.length > 1 
          ? `in ${detectedIn.slice(0, -1).join(", ")} and ${detectedIn.slice(-1)}` 
          : `in ${detectedIn[0]}`;
        
        toastr.warning(`Character actions detected ${locationMessage}. No asterisks were removed.`);
        console.log(`[Asterisks-Begone] Character actions detected ${locationMessage}, operation aborted.`);
        
        // Inform the user how to override this if needed
        toastr.info("Disable 'Check for character actions' in settings to clean up anyway.");
        
        return;
      }
    }

    let hasChanges = false;

    let examplesText = $("#mes_example_textarea").val();
    if (examplesText) {
      const cleanedExamples = examplesText.replace(/\*/g, "");
      if (cleanedExamples !== examplesText) {
        $("#mes_example_textarea").val(cleanedExamples);
        examplesText = cleanedExamples;
        hasChanges = true;
      }
    }

    let firstMessage = $("#firstmessage_textarea").val();
    if (firstMessage) {
      const cleanedFirstMessage = firstMessage.replace(/\*/g, "");
      if (cleanedFirstMessage !== firstMessage) {
        $("#firstmessage_textarea").val(cleanedFirstMessage);
        firstMessage = cleanedFirstMessage;
        hasChanges = true;
      }
    }

    let cleanedGreetings = [];
    if (character?.data?.alternate_greetings) {
      let altGreetingsChanged = false;
      cleanedGreetings = character.data.alternate_greetings.map((greeting) => {
        const cleaned = greeting.replace(/\*/g, "");
        if (cleaned !== greeting) {
          altGreetingsChanged = true;
        }
        return cleaned;
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
    }

    if (hasChanges) {
      try {
        if (examplesText) {
          const exampleTextarea = $("#mes_example_textarea");
          exampleTextarea.val(examplesText);
          exampleTextarea.trigger("change");
        }

        if (firstMessage) {
          const firstMessageTextarea = $("#firstmessage_textarea");
          firstMessageTextarea.val(firstMessage);
          firstMessageTextarea.trigger("change");
        }

        $("#create_button").trigger("click");
        toastr.success("Asterisks, BEGONE!");
      } catch (saveError) {
        console.error("[Asterisks-Begone] Save error:", saveError);
        toastr.error("Error saving changes: " + saveError.message);
        toastr.info("Please save the character manually to apply changes");
      }
    } else {
      toastr.info("No asterisks found to remove");
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
