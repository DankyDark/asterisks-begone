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

// Function to detect legitimate character actions versus excessive asterisk usage
function hasCharacterActions(text) {
  if (!text) return false;
  
  // Debug variables
  const debug = {
    originalLength: text.length,
    dialogueMatches: [],
    nonDialogueLength: 0,
    asteriskWrappedSections: [],
    asteriskWrappedLength: 0,
    remainingTextLength: 0,
    wrappedRatio: 0,
    isCharacterAction: false,
    reason: ""
  };
  
  // If the entire text is wrapped in asterisks, it's not character actions
  if (text.startsWith('*') && text.endsWith('*') && text.indexOf('*', 1) === text.length - 1) {
    debug.reason = "Full text wrapped in asterisks";
    return false;
  }
  
  // Identify dialogue sections (text in quotes)
  const dialogueRegex = /["'][^"']+["']/g;
  const dialogueMatches = text.match(dialogueRegex) || [];
  debug.dialogueMatches = dialogueMatches;
  
  // Check for a common pattern: alternating dialogue and asterisk sections
  // This is typical of text that should be cleaned up
  if (dialogueMatches.length > 0) {
    // Get the text sections by splitting on dialogue
    let sections = text;
    for (const match of dialogueMatches) {
      sections = sections.replace(match, "|||DIALOGUE|||");
    }
    sections = sections.split("|||DIALOGUE|||");
    
    // Check if all non-dialogue sections are wrapped in asterisks
    const allNonDialogueWrapped = sections.every(section => {
      const trimmed = section.trim();
      return trimmed === "" || 
             (trimmed.startsWith('*') && trimmed.endsWith('*')) ||
             !/\*/.test(trimmed); // Sections with no asterisks at all are fine
    });
    
    if (allNonDialogueWrapped) {
      debug.reason = "All non-dialogue sections are fully wrapped in asterisks";
      console.log("[Asterisks-Begone] Detected alternating dialogue and asterisk-wrapped sections", debug);
      return false; // This is the pattern we want to clean up
    }
  }
  
  // Get text without dialogue
  let nonDialogueText = text;
  for (const match of dialogueMatches) {
    nonDialogueText = nonDialogueText.replace(match, ' ');
  }
  debug.nonDialogueLength = nonDialogueText.trim().length;
  
  // Find asterisk-wrapped sections
  const asteriskWrappedRegex = /\*[^*]+\*/g;
  const asteriskWrappedContent = nonDialogueText.match(asteriskWrappedRegex) || [];
  debug.asteriskWrappedSections = asteriskWrappedContent;
  
  // If we have no asterisk-wrapped content, return false
  if (asteriskWrappedContent.length === 0) {
    debug.reason = "No asterisk-wrapped content found";
    return false;
  }
  
  // Get non-dialogue text without asterisk-wrapped segments
  let remainingNonDialogueText = nonDialogueText;
  for (const match of asteriskWrappedContent) {
    remainingNonDialogueText = remainingNonDialogueText.replace(match, ' ');
  }
  
  // Remove any remaining asterisks and trim
  remainingNonDialogueText = remainingNonDialogueText.replace(/\*/g, '').trim();
  debug.remainingTextLength = remainingNonDialogueText.length;
  
  // Calculate how much of the non-dialogue text is wrapped in asterisks
  const nonDialogueTextLength = nonDialogueText.trim().length;
  // Sum the length of all asterisk-wrapped content (excluding the asterisks themselves)
  const asteriskWrappedLength = asteriskWrappedContent.reduce((total, current) => {
    // Remove the asterisks at beginning and end when counting the length
    return total + current.slice(1, -1).length;
  }, 0);
  debug.asteriskWrappedLength = asteriskWrappedLength;
  
  // Calculate the ratio of asterisk-wrapped content to all non-dialogue content
  const wrappedRatio = nonDialogueTextLength > 0 
    ? asteriskWrappedLength / nonDialogueTextLength 
    : 0;
  debug.wrappedRatio = wrappedRatio;
  
  // Key detection logic: 
  // 1. If most (>80%) of non-dialogue content is wrapped in asterisks, it's excessive usage, not character actions
  // 2. If there's substantial plain text (not in asterisks, not dialogue), then there are mixed formats,
  //    suggesting intentional character actions
  
  // Check if non-dialogue has substantial unwrapped text (suggesting mixed format with actions)
  if (remainingNonDialogueText.length > 15) { // Higher threshold for more confidence
    debug.isCharacterAction = true;
    debug.reason = "Substantial unwrapped text found";
    console.log("[Asterisks-Begone] Text has substantial unwrapped content, identified as character actions", debug);
    return true; // True mix of formats with character actions
  }
  
  // If almost all non-dialogue text is wrapped in asterisks, this is excessive usage to clean up
  if (wrappedRatio > 0.80) { // Lowered to 80% to be more aggressive in cleaning
    debug.isCharacterAction = false;
    debug.reason = "High ratio of wrapped content";
    console.log("[Asterisks-Begone] Text has excessive asterisk usage (ratio: " + wrappedRatio.toFixed(2) + "), safe to clean", debug);
    return false; // Not character actions - just excessive asterisk usage
  }
  
  // Default to assuming character actions if we're unsure
  debug.isCharacterAction = true;
  debug.reason = "Uncertain case";
  console.log("[Asterisks-Begone] Uncertain case, defaulting to preserving asterisks", debug);
  return true;
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
