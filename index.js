import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "asterisks-begone";
const defaultSettings = {
  enabled: true,
  checkForCharacterActions: true, // When true, will check if text contains character actions before removing asterisks
  cleanDescription: false, // When true, will also clean the character description field
};

// Setup variables
let buttonAdded = false;
let isAddingButton = false;
let buttonAddTimeout = null;

// Initialize settings
extension_settings[extensionName] = extension_settings[extensionName] || {};
for (const [key, value] of Object.entries(defaultSettings)) {
  if (!extension_settings[extensionName].hasOwnProperty(key)) {
    extension_settings[extensionName][key] = value;
    saveSettingsDebounced();
  }
}

async function addSettings() {
  try {
    const response = await fetch(
      `/scripts/extensions/third-party/${extensionName}/index.html`
    );
    if (!response.ok) {
      console.error(`[${extensionName}] Error loading settings HTML:`, response.statusText);
      return;
    }

    const html = await response.text();
    $("#extensions_settings").append(html);

    // Initialize checkboxes
    $("#asterisks-begone-enabled").prop("checked", extension_settings[extensionName].enabled);
    $("#asterisks-begone-check-actions").prop("checked", extension_settings[extensionName].checkForCharacterActions);
    $("#asterisks-begone-clean-description").prop("checked", extension_settings[extensionName].cleanDescription);

    // Add event listeners
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

    $("#asterisks-begone-clean-description").on("change", function () {
      extension_settings[extensionName].cleanDescription = !!$(this).prop("checked");
      saveSettingsDebounced();
    });
  } catch (error) {
    console.error(`[${extensionName}] Error adding settings:`, error);
  }
}

function checkAndAddButton() {
  if (buttonAddTimeout) clearTimeout(buttonAddTimeout);

  buttonAddTimeout = setTimeout(() => {
    if (isAddingButton) return;

    try {
      isAddingButton = true;
      $(".asterisks-begone-button").remove();

      if (!extension_settings[extensionName].enabled || $(".asterisks-begone-button").length > 0) {
        buttonAdded = extension_settings[extensionName].enabled && $(".asterisks-begone-button").length > 0;
        isAddingButton = false;
        return;
      }

      const firstMessageLabel = $('div:contains("First message")').filter(function() {
        return $(this).text().trim() === "First message";
      });

      if (firstMessageLabel.length) {
        const button = $("<input>", {
          type: "button",
          id: "asterisks-begone-button",
          class: "menu_button menu_button_icon asterisks-begone-button margin0",
          value: "Asterisks Begone",
          click: removeAsterisks,
        });

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

// Detect if text has legitimate character actions vs formatting asterisks
function hasCharacterActions(text) {
  if (!text?.trim().includes('*')) return false;

  const segments = text.match(/\*([^*]+)\*/g) || [];
  if (!segments.length) return false;

  let actionScore = 0, formattingScore = 0;

  // Check wrapping patterns
  const wrappedRatio = segments.join('').length / text.length;
  if (wrappedRatio > 0.7) formattingScore += 3;

  // Check paragraph consistency
  const lines = text.split('\n').filter(l => l.trim());
  const wrappedLines = lines.filter(l => l.trim().match(/^\*.*\*$/));
  if (lines.length > 3 && wrappedLines.length / lines.length > 0.8) formattingScore += 3;

  // Action keywords (condensed list)
  const actionWords = /\b(walks?|runs?|sits?|stands?|moves?|grabs?|takes?|holds?|smiles?|frowns?|nods?|looks?|laughs?|cries?|whispers?|shouts?)\b/i;
  const emotionWords = /\b(nervously|quickly|slowly|gently|hesitantly|confidently)\b/i;

  for (const segment of segments) {
    const content = segment.replace(/\*/g, '').toLowerCase();
    const words = content.split(' ');

    // Score action indicators
    if (actionWords.test(content)) actionScore += 2;
    if (emotionWords.test(content)) actionScore += 1;
    if (/\b(i|you|he|she|they)\b/.test(content) && words.length <= 8) actionScore += 1;

    // Score formatting indicators
    if (content.length > 50 && !actionWords.test(content)) formattingScore += 1;
    if (/^[A-Z\s]+$/.test(content) || content.includes('!!!') || words.length === 1) formattingScore += 1;
    if (content.length > 100) formattingScore += 1;
  }

  return actionScore > formattingScore + 2;
}



// Helper functions for field processing
function getCharacterFields(character) {
  return {
    examplesText: $("#mes_example_textarea").val() || "",
    firstMessage: $("#firstmessage_textarea").val() || "",
    alternateGreetings: character?.data?.alternate_greetings || [],
    description: character?.data?.description || ""
  };
}

function hasAnyAsterisks(fields) {
  const { examplesText, firstMessage, alternateGreetings, description } = fields;
  return examplesText.includes('*') ||
         firstMessage.includes('*') ||
         (extension_settings[extensionName].cleanDescription && description.includes('*')) ||
         alternateGreetings.some(g => g?.includes('*'));
}

function shouldCleanAnyField(fields) {
  if (!extension_settings[extensionName].checkForCharacterActions) return true;

  const { examplesText, firstMessage, alternateGreetings, description } = fields;

  return (examplesText.includes('*') && !hasCharacterActions(examplesText)) ||
         (firstMessage.includes('*') && !hasCharacterActions(firstMessage)) ||
         (extension_settings[extensionName].cleanDescription && description.includes('*') && !hasCharacterActions(description)) ||
         alternateGreetings.some(g => g?.includes('*') && !hasCharacterActions(g));
}

function cleanField(selector, value, fieldName, cleanedFields) {
  if (!value?.includes('*')) return false;

  const cleaned = value.replace(/\*/g, "");
  if (cleaned !== value) {
    $(selector).val(cleaned);
    cleanedFields.push(fieldName);
    return true;
  }
  return false;
}

async function removeAsterisks() {
  try {
    const context = getContext();
    if (!context.characterId) return toastr.info("No character selected");

    const character = context.characters[context.characterId];
    if (!character) return toastr.error("Character data not found");

    const fields = getCharacterFields(character);

    if (!hasAnyAsterisks(fields)) {
      return toastr.info("No asterisks found to remove");
    }

    if (!shouldCleanAnyField(fields)) {
      return toastr.warning("Character actions detected. To delete asterisks, disable setting.");
    }

    const cleanedFields = [];
    let hasChanges = false;

    // Clean all fields
    hasChanges |= cleanField("#mes_example_textarea", fields.examplesText, "Example messages", cleanedFields);
    hasChanges |= cleanField("#firstmessage_textarea", fields.firstMessage, "First message", cleanedFields);

    if (extension_settings[extensionName].cleanDescription) {
      hasChanges |= cleanField("#description_textarea", fields.description, "Description", cleanedFields);
      if (fields.description.includes('*')) {
        character.data.description = fields.description.replace(/\*/g, "");
      }
    }

    // Clean alternate greetings
    const cleanedGreetings = fields.alternateGreetings.map((greeting, i) => {
      if (!greeting?.includes('*')) return greeting;
      cleanedFields.push(`Alternate greeting ${i + 1}`);
      hasChanges = true;
      return greeting.replace(/\*/g, "");
    });

    if (hasChanges && cleanedGreetings.some((g, i) => g !== fields.alternateGreetings[i])) {
      character.data.alternate_greetings = cleanedGreetings;
      $("#alternate_greetings_template").val(JSON.stringify(cleanedGreetings, null, 2));
    }

    if (hasChanges) {
      ["#mes_example_textarea", "#firstmessage_textarea", "#description_textarea"].forEach(sel => $(sel).trigger("change"));
      $("#create_button").trigger("click");
      toastr.success("Asterisks, BEGONE!");
    } else {
      toastr.info("No asterisks found to remove");
    }
  } catch (error) {
    console.error("[Asterisks-Begone] Error:", error);
    toastr.error("Error: " + error.message);
  }
}

$(document).ready(function () {
  addSettings();

  $(document).on("click", ".character_select, #rm_button_selected_ch",
    () => setTimeout(checkAndAddButton, 300));

  $(document).on("click", ".advanced_button, .toggle_advanced",
    () => setTimeout(checkAndAddButton, 300));
  setTimeout(checkAndAddButton, 1000);
});
