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
// Character actions are specific actions wrapped in asterisks mixed with regular text or dialogue
// We want to detect:
// 1. True character actions: "Hello there. *Character waves.* How are you today?"
// 2. But allow cleaning when everything except dialogue is wrapped in asterisks
//    like: "*You wake with a start.* "Hello," *she says with a smile.*"
function hasCharacterActions(text) {
  if (!text) return false;
  
  // If the entire text is wrapped in asterisks, it's not character actions
  if (text.startsWith('*') && text.endsWith('*') && text.indexOf('*', 1) === text.length - 1) {
    return false;
  }
  
  // Split the text into segments: dialogue (quoted text) and non-dialogue parts
  // Check for both double quotes and single quotes for dialogue
  const dialogueRegex = /["'][^"']+["']/g;
  const dialogueMatches = text.match(dialogueRegex) || [];
  
  // Get text without dialogue
  let nonDialogueText = text;
  for (const match of dialogueMatches) {
    nonDialogueText = nonDialogueText.replace(match, ' '); // Replace dialogue with spaces to preserve structure
  }
  
  // Find all content wrapped in asterisks in the non-dialogue text
  const asteriskWrappedContent = nonDialogueText.match(/\*[^*]+\*/g) || [];
  
  // If we have no asterisk-wrapped content, return false
  if (asteriskWrappedContent.length === 0) {
    return false;
  }
  
  // Get non-dialogue text without asterisk segments
  let remainingNonDialogueText = nonDialogueText;
  for (const match of asteriskWrappedContent) {
    remainingNonDialogueText = remainingNonDialogueText.replace(match, ' ');
  }
  
  // Remove remaining asterisks and trim
  remainingNonDialogueText = remainingNonDialogueText.replace(/\*/g, '').trim();
  
  // Check if there's any substantial text outside of both dialogue and asterisk-wrapped segments
  // If there's only dialogue and asterisk-wrapped content with no plain text between them,
  // this is likely a case of overuse of asterisks rather than character actions
  if (remainingNonDialogueText.length > 10) { // Require a meaningful amount of plain text (10+ chars)
    // There's plain text outside both dialogue and asterisk-wrapped content
    // This means we have a true mix of styles, likely with character actions
    return true;
  }
  
  // Check if the non-dialogue sections are entirely wrapped in asterisks
  // If all non-dialogue text is wrapped in asterisks, this is excessive usage
  // rather than intentional character actions
  const nonDialogueContainsOnlyAsteriskWrapped = 
    asteriskWrappedContent.join('').length >= nonDialogueText.trim().length * 0.8; // 80% threshold
  
  // Return false if everything is wrapped - this is excessive usage we want to clean
  return !nonDialogueContainsOnlyAsteriskWrapped;
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
      
      // Check all text content for character actions
      if (hasCharacterActions(examplesText) || 
          hasCharacterActions(firstMessage) ||
          alternateGreetings.some(greeting => hasCharacterActions(greeting))) {
        toastr.warning("Character actions found, not removing any asterisks.");
        console.log("[Asterisks-Begone] Character actions detected, operation aborted.");
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
