using UnityEngine;
using System.Collections;
using System.Collections.Generic;

public class StrangerCombat : MonoBehaviour
{
    [Header("Configurações do Soco")]
    public GameObject handVisual; // Arraste uma esfera aqui
    public float punchForce = 15f;
    public float handDistance = 2f;

    [Header("Personagens")]
    public List<Rigidbody> characters = new List<Rigidbody>();

    private Camera mainCam;

    void Start()
    {
        mainCam = Camera.main;
        
        // Se não arrastou os personagens, ele tenta achar pelo nome
        if (characters.Count == 0) {
            foreach (GameObject obj in GameObject.FindObjectsOfType<GameObject>()) {
                if (obj.name.Contains("Mike") || obj.name.Contains("Dustin")) {
                    if (obj.GetComponent<Rigidbody>()) characters.Add(obj.GetComponent<Rigidbody>());
                }
            }
        }
    }

    void Update()
    {
        // Movimentação da mão (Segue o toque ou o mouse para teste)
        Vector3 mousePos = Input.mousePosition;
        mousePos.z = handDistance;
        Vector3 targetPos = mainCam.ScreenToWorldPoint(mousePos);
        
        if (handVisual != null) {
            handVisual.transform.position = Vector3.Lerp(handVisual.transform.position, targetPos, Time.deltaTime * 20f);
        }

        // Checar colisão manualmente para garantir performance máxima
        CheckPunchCollision();
    }

    void CheckPunchCollision()
    {
        foreach (Rigidbody rb in characters)
        {
            float dist = Vector3.Distance(handVisual.transform.position, rb.worldCenterOfMass);
            
            // Se a mão encostar no boneco
            if (dist < 0.8f) 
            {
                Vector3 punchDir = rb.transform.position - handVisual.transform.position;
                punchDir.y = 0.5f; // Dá um leve "up" no soco pra ele voar bonito
                
                rb.AddForce(punchDir.normalized * punchForce, ForceMode.Impulse);
                
                // Feedback visual: Fica vermelho por um tempo
                StartCoroutine(FlashRed(rb.GetComponent<Renderer>()));
            }
        }
    }

    IEnumerator FlashRed(Renderer rend)
    {
        if (rend == null) yield break;
        Color original = rend.material.color;
        rend.material.color = Color.red;
        yield return new WaitForSeconds(0.2f);
        rend.material.color = original;
    }
}
