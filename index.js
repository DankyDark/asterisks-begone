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
          class: "menu_button asterisks-begone-button",
          value: "Asterisks Begone",
          style: "display: inline-block !important; visibility: visible !important; opacity: 1 !important;",
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

// Function to detect if text has legitimate character actions
// Returns true if we should preserve the asterisks, false if we should clean them up
function hasCharacterActions(text) {
  if (!text) return false;
  
  // console.log("[Asterisks-Begone] Analyzing text:", text.substring(0, 100) + (text.length > 100 ? "..." : ""));
  
  // If the entire text is wrapped in asterisks, clean it up
  if (text.startsWith('*') && text.endsWith('*') && text.indexOf('*', 1) === text.length - 1) {
    // console.log("[Asterisks-Begone] Entire text is wrapped in asterisks - cleaning up");
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
    
    // console.log("[Asterisks-Begone] Paragraph analysis:", {
    //   total: paragraphs.length,
    //   wrapped: wrappedParagraphs,
    //   ratio: wrappedRatio
    // });
    
    // If more than 60% of paragraphs are wrapped, clean up
    if (wrappedRatio > 0.6) {
      // console.log("[Asterisks-Begone] Most paragraphs are wrapped in asterisks - cleaning up");
      return false; // false = clean up
    }
  }
  
  // By default, preserve asterisks (assume they are character actions)
  // console.log("[Asterisks-Begone] Preserving asterisks by default");
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

    // Track state
    let cleanedFields = [];
    let anySectionShouldBeClean = false;
    let anyAsterisksFound = false;
    let hasChanges = false;
    
    // Get field values
    const examplesText = $("#mes_example_textarea").val();
    const firstMessage = $("#firstmessage_textarea").val();
    const alternateGreetings = character?.data?.alternate_greetings || [];
    const description = character?.data?.description || "";

    // First check if there are ANY asterisks to remove at all
    if ((examplesText && examplesText.includes('*')) || 
        (firstMessage && firstMessage.includes('*')) ||
        (extension_settings[extensionName].cleanDescription && description && description.includes('*'))) {
      anyAsterisksFound = true;
    } else {
      for (const greeting of alternateGreetings) {
        if (greeting && greeting.includes('*')) {
          anyAsterisksFound = true;
          break;
        }
      }
    }

    // If no asterisks found, show message and return
    if (!anyAsterisksFound) {
      toastr.info("No asterisks found to remove");
      console.log("[Asterisks-Begone] No asterisks found to remove");
      return;
    }

    // First pass: check if ANY field should be cleaned
    if (extension_settings[extensionName].checkForCharacterActions) {
      // Check example messages
      if (examplesText && examplesText.includes('*') && !hasCharacterActions(examplesText)) {
        anySectionShouldBeClean = true;
        // console.log("[Asterisks-Begone] Example messages should be cleaned");
      }

      // Check first message if needed
      if (!anySectionShouldBeClean && firstMessage && firstMessage.includes('*') && 
          !hasCharacterActions(firstMessage)) {
        anySectionShouldBeClean = true;
        // console.log("[Asterisks-Begone] First message should be cleaned");
      }

      // Check description if enabled and needed
      if (!anySectionShouldBeClean && extension_settings[extensionName].cleanDescription && 
          description && description.includes('*') && !hasCharacterActions(description)) {
        anySectionShouldBeClean = true;
        // console.log("[Asterisks-Begone] Description should be cleaned");
      }

      // Check alternate greetings if needed
      if (!anySectionShouldBeClean) {
        for (let i = 0; i < alternateGreetings.length; i++) {
          const greeting = alternateGreetings[i];
          if (greeting && greeting.includes('*') && !hasCharacterActions(greeting)) {
            anySectionShouldBeClean = true;
            // console.log(`[Asterisks-Begone] Alternate greeting ${i+1} should be cleaned`);
            break;
          }
        }
      }
    } else {
      // If not checking for character actions, we always clean everything
      anySectionShouldBeClean = true;
    }

    // If no section should be cleaned, show a message and return
    if (!anySectionShouldBeClean && extension_settings[extensionName].checkForCharacterActions) {
      toastr.warning("Character actions detected. To delete asterisks, disable setting.");
      // console.log("[Asterisks-Begone] No sections should be cleaned");
      return;
    }

    // Second pass: clean ALL fields since at least one should be cleaned
    // console.log("[Asterisks-Begone] At least one section should be cleaned, cleaning ALL sections");
    
    // Clean example messages
    if (examplesText) {
      const cleanedText = examplesText.replace(/\*/g, "");
      if (cleanedText !== examplesText) {
        $("#mes_example_textarea").val(cleanedText);
        cleanedFields.push("Example messages");
        hasChanges = true;
      }
    }

    // Clean first message
    if (firstMessage) {
      const cleanedText = firstMessage.replace(/\*/g, "");
      if (cleanedText !== firstMessage) {
        $("#firstmessage_textarea").val(cleanedText);
        cleanedFields.push("First message");
        hasChanges = true;
      }
    }

    // Clean description if enabled
    if (extension_settings[extensionName].cleanDescription && description) {
      const cleanedDescription = description.replace(/\*/g, "");
      if (cleanedDescription !== description) {
        character.data.description = cleanedDescription;
        $("#description_textarea").val(cleanedDescription);
        cleanedFields.push("Description");
        hasChanges = true;
      }
    }

    // Clean alternate greetings
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

    // Display appropriate messages and save changes
    if (hasChanges) {
      try {
        // Trigger changes to save
        $("#mes_example_textarea").trigger("change");
        $("#firstmessage_textarea").trigger("change");
        $("#description_textarea").trigger("change");
        $("#create_button").trigger("click");
        
        toastr.success("Asterisks, BEGONE!");
        console.log("[Asterisks-Begone] Fields cleaned:", cleanedFields);
      } catch (saveError) {
        console.error("[Asterisks-Begone] Save error:", saveError);
        toastr.error("Error saving changes: " + saveError.message);
        toastr.info("Please save the character manually to apply changes");
      }
    } else {
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

  $(document).on("click", ".character_select, #rm_button_selected_ch", 
    () => setTimeout(checkAndAddButton, 300));

  $(document).on("click", ".advanced_button, .toggle_advanced", 
    () => setTimeout(checkAndAddButton, 300));

  setTimeout(checkAndAddButton, 1000);
  setTimeout(checkAndAddButton, 2000);
});
