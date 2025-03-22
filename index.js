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
  
  console.log("[Asterisks-Begone] Analyzing text:", text.substring(0, 100) + (text.length > 100 ? "..." : ""));
  
  // If the entire text is wrapped in asterisks, clean it up
  if (text.startsWith('*') && text.endsWith('*') && text.indexOf('*', 1) === text.length - 1) {
    console.log("[Asterisks-Begone] Entire text is wrapped in asterisks - cleaning up");
    return false; // false = clean up
  }
  
  // Check paragraph pattern - if most paragraphs are wrapped, clean up
  const paragraphs = text.split(/\n+/).filter(p => p.trim() !== '');
  if (paragraphs.length > 1) {
    const wrappedParagraphs = paragraphs.filter(p => {
      const trimmed = p.trim();
      return trimmed.startsWith('*') && trimmed.endsWith('*');
    }).length;
    
    const wrappedRatio = wrappedParagraphs / paragraphs.length;
    
    console.log("[Asterisks-Begone] Paragraph analysis:", {
      total: paragraphs.length,
      wrapped: wrappedParagraphs,
      ratio: wrappedRatio
    });
    
    // If more than 60% of paragraphs are wrapped, clean up
    if (wrappedRatio > 0.6) {
      console.log("[Asterisks-Begone] Most paragraphs are wrapped in asterisks - cleaning up");
      return false; // false = clean up
    }
  }
  
  // By default, preserve asterisks (assume they are character actions)
  console.log("[Asterisks-Begone] Preserving asterisks by default");
  return true; // true = preserve
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

    // We'll track which fields we've checked
    let cleanedFields = [];
    let preservedFields = [];
    let hasChanges = false;

    // Helper function to check a field
    const checkField = (fieldName, fieldText) => {
      if (!fieldText) return null;
      
      // Check for character actions if the setting is enabled
      if (extension_settings[extensionName].checkForCharacterActions) {
        const shouldPreserve = hasCharacterActions(fieldText);
        console.log(`[Asterisks-Begone] ${fieldName} check result: ${shouldPreserve}`);
        
        if (shouldPreserve) {
          preservedFields.push(fieldName);
          return { shouldClean: false, text: fieldText };
        }
      }
      
      // Either setting is disabled or field should be cleaned
      const cleanedText = fieldText.replace(/\*/g, "");
      const changed = cleanedText !== fieldText;
      
      if (changed) {
        cleanedFields.push(fieldName);
      }
      
      return { shouldClean: true, text: cleanedText, changed };
    };

    // Process all fields
    
    // Example messages
    const examplesText = $("#mes_example_textarea").val();
    const examplesResult = checkField("Example messages", examplesText);
    if (examplesResult?.changed) {
      $("#mes_example_textarea").val(examplesResult.text);
      hasChanges = true;
    }

    // First message
    const firstMessage = $("#firstmessage_textarea").val();
    const firstMessageResult = checkField("First message", firstMessage);
    if (firstMessageResult?.changed) {
      $("#firstmessage_textarea").val(firstMessageResult.text);
      hasChanges = true;
    }

    // Alternate greetings
    let altGreetingsChanged = false;
    const alternateGreetings = character?.data?.alternate_greetings || [];
    
    const cleanedGreetings = alternateGreetings.map((greeting, index) => {
      if (!greeting) return greeting;
      
      const result = checkField(`Alternate greeting ${index + 1}`, greeting);
      
      if (result?.changed) {
        altGreetingsChanged = true;
      }
      
      return result?.text || greeting;
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
        
        // Show appropriate success message
        toastr.success("Asterisks, BEGONE!");
        console.log("[Asterisks-Begone] Fields cleaned:", cleanedFields);
      } catch (saveError) {
        console.error("[Asterisks-Begone] Save error:", saveError);
        toastr.error("Error saving changes: " + saveError.message);
        toastr.info("Please save the character manually to apply changes");
      }
    } else if (preservedFields.length > 0) {
      // No changes but some fields were preserved
      const message = preservedFields.length > 1 
        ? `Character actions detected in ${preservedFields.join(", ")}. No asterisks were removed.` 
        : `Character actions detected in ${preservedFields[0]}. No asterisks were removed.`;
      
      toastr.warning(message);
      toastr.info("The extension only removes asterisks when most paragraphs are wrapped. Disable 'Check for character actions' in settings to clean up anyway.");
      
      console.log("[Asterisks-Begone] No changes made, fields preserved:", preservedFields);
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
